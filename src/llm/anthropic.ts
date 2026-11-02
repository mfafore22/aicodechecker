// Claude implementation of LLMProvider.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ChunkSummary } from "../types.js";
import {
  CHUNK_SYSTEM_PROMPT,
  OVERVIEW_SYSTEM_PROMPT,
  chunkPrompt,
  overviewPrompt,
} from "./prompts.js";
import {
  SummaryRefusedError,
  type ChunkSummaryInput,
  type LLMProvider,
  type OverviewInput,
} from "./provider.js";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AnthropicProviderOptions {
  apiKey?: string;
  model: string;
  effort: Effort;
}

const ChunkSummarySchema = z.object({
  summary: z.string(),
  why: z.string(),
  checkClosely: z.array(z.string()),
});

const OverviewSchema = z.object({ overview: z.string() });

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(private options: AnthropicProviderOptions) {
    // With no apiKey, the SDK reads ANTHROPIC_API_KEY from the environment.
    this.client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});
  }

  async summarizeChunk(input: ChunkSummaryInput): Promise<ChunkSummary> {
    const result = await this.ask(CHUNK_SYSTEM_PROMPT, chunkPrompt(input), ChunkSummarySchema);
    return { ...result, checkClosely: result.checkClosely.slice(0, 3) };
  }

  async summarizeOverview(input: OverviewInput): Promise<string> {
    const result = await this.ask(OVERVIEW_SYSTEM_PROMPT, overviewPrompt(input), OverviewSchema);
    return result.overview;
  }

  private async ask<T extends z.ZodType>(system: string, prompt: string, schema: T): Promise<z.infer<T>> {
    // The SDK already retries rate limits and server errors; anything else reaches the caller.
    const response = await this.client.messages.parse({
      model: this.options.model,
      max_tokens: 16000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: prompt }],
      output_config: { effort: this.options.effort, format: zodOutputFormat(schema) },
    });

    if (response.stop_reason === "refusal") {
      throw new SummaryRefusedError(response.stop_details?.explanation ?? "The model declined to summarize this chunk.");
    }
    if (response.stop_reason === "max_tokens" || response.parsed_output == null) {
      throw new Error(`The model's answer was incomplete (stop_reason: ${response.stop_reason}).`);
    }
    return response.parsed_output;
  }
}
