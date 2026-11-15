// The Probot app: listens for pull request events and queues a review for each one.
// The handler returns right away; the review runs in the background.

import type { ApplicationFunction, Probot } from "probot";
import { createLLMProvider, type LLMProvider } from "./llm/index.js";
import { runReview } from "./pipeline.js";
import { ReviewQueue } from "./queue.js";

/** New PRs, reopened PRs and new pushes. Draft PRs are reviewed too. */
export const REVIEW_EVENTS = [
  "pull_request.opened",
  "pull_request.reopened",
  "pull_request.synchronize",
] as const;

export interface AppOptions {
  llm?: LLMProvider;
  queue?: ReviewQueue;
  review?: typeof runReview;
  env?: NodeJS.ProcessEnv;
}

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a whole number of 1 or more; got "${value}".`);
  return n;
}

export function createApp(options: AppOptions = {}): ApplicationFunction {
  return (app: Probot) => {
    const env = options.env ?? process.env;
    const llm = options.llm ?? createLLMProvider(env);
    const review = options.review ?? runReview;
    const concurrency = positiveInt(env.LLM_CONCURRENCY, 4, "LLM_CONCURRENCY");
    const queue = options.queue ?? new ReviewQueue(app.log, positiveInt(env.REVIEW_CONCURRENCY, 2, "REVIEW_CONCURRENCY"));

    app.on([...REVIEW_EVENTS], async (context) => {
      const { pull_request: pr, repository } = context.payload;
      const job = {
        owner: repository.owner.login,
        repo: repository.name,
        pullNumber: pr.number,
        headSha: pr.head.sha,
      };
      const key = `${job.owner}/${job.repo}#${job.pullNumber}`;
      const log = context.log.child({ pr: key, sha: job.headSha.slice(0, 7) });
      log.info({ event: `${context.name}.${context.payload.action}` }, "Queued review");
      queue.enqueue(key, () => review({ octokit: context.octokit, llm, log, concurrency }, job));
    });
  };
}

export default createApp();
