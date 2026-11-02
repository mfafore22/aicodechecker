// Picks the AI service from the environment. To add a service, implement LLMProvider
// in its own file and add a case here.

import { AnthropicProvider, type Effort } from "./anthropic.js";
import type { LLMProvider } from "./provider.js";

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export function createLLMProvider(env: NodeJS.ProcessEnv = process.env): LLMProvider {
  const provider = env.LLM_PROVIDER || "anthropic";
  const effort = (env.LLM_EFFORT || "medium") as Effort;
  if (!EFFORTS.includes(effort)) {
    throw new Error(`LLM_EFFORT must be one of ${EFFORTS.join(", ")}; got "${effort}".`);
  }

  switch (provider) {
    case "anthropic":
      return new AnthropicProvider({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.LLM_MODEL || "claude-haiku-5-5",
        effort,
      });
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}". Supported: anthropic.`);
  }
}

export type { LLMProvider } from "./provider.js";
export { SummaryRefusedError } from "./provider.js";
