// Runs one review from start to finish:
// download the PR → label files → chunk → AI summaries → post the comment.

import type { Logger, ProbotOctokit } from "probot";
import { buildChunks } from "./chunker/chunk.js";
import { classifyFile } from "./chunker/classify.js";
import { upsertReviewComment } from "./github/comment.js";
import { fetchPullRequest, type PullRequestRef } from "./github/fetch-pr.js";
import { SummaryRefusedError, type LLMProvider } from "./llm/index.js";
import type { PullRequestInfo } from "./llm/provider.js";
import { renderFailed, renderInProgress, renderReviewPlan } from "./review/render.js";
import type { Chunk, PullRequestData, ReviewedChunk } from "./types.js";
import { mapWithConcurrency } from "./util/concurrency.js";

export interface ReviewJob extends PullRequestRef {
  /** The commit the webhook was about. A newer push makes this review stale. */
  headSha: string;
}

export interface PipelineDeps {
  octokit: ProbotOctokit;
  llm: LLMProvider;
  log: Logger;
  /** How many chunk summaries run at once. */
  concurrency: number;
}

export type ReviewOutcome = "posted" | "stale";

export async function runReview(deps: PipelineDeps, job: ReviewJob): Promise<ReviewOutcome> {
  const { octokit, log } = deps;
  const pr = await fetchPullRequest(octokit, job);
  if (pr.headSha !== job.headSha) {
    log.info({ job }, "PR has newer commits; skipping this review");
    return "stale";
  }

  const commentId = await upsertReviewComment(octokit, job, renderInProgress());
  try {
    const chunks = buildChunks(pr.files.map(classifyFile));
    const reviewed = await summarizeChunks(deps, pr, chunks);
    const overview = await writeOverview(deps, pr, reviewed);

    // The AI calls take a while; don't overwrite a newer review with this one.
    if ((await currentHeadSha(octokit, job)) !== job.headSha) {
      log.info({ job }, "PR changed while reviewing; dropping this review");
      return "stale";
    }

    const body = renderReviewPlan({ owner: pr.owner, repo: pr.repo, number: pr.number, overview, chunks: reviewed });
    await upsertReviewComment(octokit, job, body, commentId);
    log.info({ job, chunks: reviewed.length }, "Posted review plan");
    return "posted";
  } catch (error) {
    await upsertReviewComment(octokit, job, renderFailed(), commentId).catch(() => {});
    throw error;
  }
}

function prInfo(pr: PullRequestData): PullRequestInfo {
  return { title: pr.title, body: pr.body, linkedIssues: pr.linkedIssues };
}

async function summarizeChunks(
  { llm, log, concurrency }: PipelineDeps,
  pr: PullRequestData,
  chunks: Chunk[],
): Promise<ReviewedChunk[]> {
  return mapWithConcurrency(chunks, concurrency, async (chunk): Promise<ReviewedChunk> => {
    if (chunk.skimOnly) return chunk;
    if (chunk.files.every((f) => f.patchMissing)) {
      return { ...chunk, summaryError: "these files are too large for GitHub to show, so read them directly" };
    }
    try {
      return { ...chunk, summary: await llm.summarizeChunk({ pr: prInfo(pr), chunk }) };
    } catch (error) {
      // One failed chunk shouldn't sink the whole review.
      log.warn({ err: error, chunk: chunk.title }, "Chunk summary failed");
      const reason = error instanceof SummaryRefusedError ? "the AI declined to summarize it" : "the AI request failed";
      return { ...chunk, summaryError: reason };
    }
  });
}

async function writeOverview(
  { llm, log }: PipelineDeps,
  pr: PullRequestData,
  chunks: ReviewedChunk[],
): Promise<string | undefined> {
  const summarized = chunks.flatMap((c) => (c.summary ? [{ title: c.title, summary: c.summary.summary }] : []));
  if (summarized.length === 0) return undefined;
  try {
    return await llm.summarizeOverview({ pr: prInfo(pr), chunks: summarized });
  } catch (error) {
    log.warn({ err: error }, "Overview failed; posting the plan without it");
    return undefined;
  }
}

async function currentHeadSha(octokit: ProbotOctokit, { owner, repo, pullNumber }: PullRequestRef): Promise<string> {
  const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
  return data.head.sha;
}
