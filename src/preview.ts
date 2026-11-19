// Dry run: builds the review plan for any PR and prints it, without posting anything.
//
//   npm run preview -- owner/repo#123
//   npm run preview -- https://github.com/owner/repo/pull/123 --no-ai
//
// Needs ANTHROPIC_API_KEY unless --no-ai is given. GITHUB_TOKEN is optional for public repos
// (without it GitHub allows about 60 requests an hour) and required for private ones.

import { ProbotOctokit, type Logger } from "probot";
import { fetchPullRequest, type PullRequestRef } from "./github/fetch-pr.js";
import { createLLMProvider } from "./llm/index.js";
import { buildReviewPlan } from "./pipeline.js";

const USAGE = `Usage: npm run preview -- <owner/repo#123 | PR URL> [--no-ai]

  --no-ai   Show the chunks only, with no AI summaries (free, no API key needed)

Settings come from .env: ANTHROPIC_API_KEY, GITHUB_TOKEN (optional for public repos), LLM_MODEL.`;

const PR_REFERENCE = [
  /^([\w.-]+)\/([\w.-]+)#(\d+)$/,
  /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/,
];

export function parsePullRequestRef(input: string): PullRequestRef | undefined {
  for (const re of PR_REFERENCE) {
    const match = re.exec(input.trim());
    if (match) return { owner: match[1], repo: match[2], pullNumber: Number(match[3]) };
  }
  return undefined;
}

/** Progress goes to stderr so stdout is just the comment, e.g. for `> preview.md`. */
const log = {
  info: (_fields: unknown, message?: string) => console.error(`· ${message}`),
  warn: (fields: { err?: unknown }, message?: string) =>
    console.error(`! ${message}${fields?.err instanceof Error ? `: ${fields.err.message}` : ""}`),
} as unknown as Pick<Logger, "info" | "warn">;

async function main(args: string[]): Promise<number> {
  const useAI = !args.includes("--no-ai");
  const positional = args.filter((a) => !a.startsWith("--"));
  const ref = positional.length === 1 ? parsePullRequestRef(positional[0]) : undefined;
  if (!ref || args.includes("--help")) {
    console.error(USAGE);
    return args.includes("--help") ? 0 : 1;
  }
  if (useAI && !process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to .env, or run with --no-ai to see the chunks only.");
    return 1;
  }

  const token = process.env.GITHUB_TOKEN;
  const octokit = new ProbotOctokit(token ? { auth: { token } } : {});
  const concurrency = Number(process.env.LLM_CONCURRENCY) || 4;

  console.error(`· Fetching ${ref.owner}/${ref.repo}#${ref.pullNumber}${token ? "" : " (no GITHUB_TOKEN, public access)"}`);
  const pr = await fetchPullRequest(octokit, ref);
  console.error(`· ${pr.files.length} files changed${useAI ? ", asking the AI for summaries" : ""}`);

  const started = Date.now();
  const plan = await buildReviewPlan({ log, concurrency, llm: useAI ? createLLMProvider() : undefined }, pr);
  console.error(`· ${plan.chunks.length} chunks in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
  console.log(plan.body);
  return 0;
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("/preview.ts") || process.argv[1]?.endsWith("preview.js");
if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: { status?: number; message?: string }) => {
      if (error.status === 404) console.error("PR not found. For a private repo, set GITHUB_TOKEN in .env.");
      else if (error.status === 403) console.error("GitHub refused the request (rate limit?). Set GITHUB_TOKEN in .env.");
      else console.error(error.message ?? error);
      process.exit(1);
    },
  );
}
