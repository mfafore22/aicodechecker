// The one interface the rest of the app uses to talk to an AI service.
// Each service (Claude, OpenAI, ...) gets its own file that implements it,
// so switching services never touches the pipeline.

import type { Chunk, ChunkSummary, LinkedIssue } from "../types.js";

export interface PullRequestInfo {
  title: string;
  body: string;
  linkedIssues: LinkedIssue[];
}

export interface ChunkSummaryInput {
  pr: PullRequestInfo;
  chunk: Chunk;
}

export interface OverviewInput {
  pr: PullRequestInfo;
  /** Chunk titles with their one-line summaries, in reading order. */
  chunks: Array<{ title: string; summary: string }>;
}

export interface LLMProvider {
  /** Explains one chunk: what changed, why, and what to check closely. */
  summarizeChunk(input: ChunkSummaryInput): Promise<ChunkSummary>;
  /** Writes the one- or two-sentence overview at the top of the comment. */
  summarizeOverview(input: OverviewInput): Promise<string>;
}

/** The AI service declined to answer. The pipeline shows "summary unavailable" for that chunk. */
export class SummaryRefusedError extends Error {}
