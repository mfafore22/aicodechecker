import type { Logger, ProbotOctokit } from "probot";
import { describe, expect, it, vi } from "vitest";
import type { LLMProvider } from "./llm/provider.js";
import { runReview } from "./pipeline.js";

const job = { owner: "me", repo: "app", pullNumber: 7, headSha: "abc" };
const log = { info: vi.fn(), warn: vi.fn() } as unknown as Logger;

const files = [
  { filename: "src/api/users.ts", status: "modified", additions: 2, deletions: 0, patch: "@@ -1 +1,2 @@\n a\n+b" },
  { filename: "src/lib/mail.ts", status: "modified", additions: 1, deletions: 0, patch: "@@ -1 +1,2 @@\n a\n+b" },
  { filename: "yarn.lock", status: "modified", additions: 50, deletions: 50, patch: "@@ -1 +1 @@\n-x\n+y" },
];

/** A pretend GitHub. `heads` is the PR's head commit on each pulls.get call. */
function fakeGitHub(heads: string[]) {
  const posted: string[] = [];
  const pullsGet = vi.fn(async () => ({
    data: { title: "Add user lookup", body: "fixes #3", head: { sha: heads.shift() ?? "abc" } },
  }));
  const fake = {
    rest: {
      pulls: { get: pullsGet, listFiles: vi.fn() },
      issues: {
        get: vi.fn(async () => ({ data: { number: 3, title: "Need lookup", body: "please" } })),
        listComments: vi.fn(),
        createComment: vi.fn(async ({ body }: { body: string }) => (posted.push(body), { data: { id: 1 } })),
        updateComment: vi.fn(async ({ body }: { body: string }) => (posted.push(body), { data: {} })),
      },
    },
    paginate: vi.fn(async (fn: unknown) => (fn === fake.rest.pulls.listFiles ? files : [])),
  };
  return { posted, octokit: fake as unknown as ProbotOctokit };
}

function fakeLLM(failOn?: string): LLMProvider {
  return {
    summarizeChunk: vi.fn(async ({ chunk }) => {
      if (chunk.title.includes(failOn ?? "\0")) throw new Error("boom");
      return { summary: `Summary of ${chunk.title}`, why: "Fixes #3.", checkClosely: [] };
    }),
    summarizeOverview: vi.fn(async () => "Adds a user lookup."),
  };
}

describe("runReview", () => {
  it("shows progress, then posts the finished plan in the same comment", async () => {
    const { posted, octokit } = fakeGitHub(["abc", "abc"]);
    const llm = fakeLLM();
    expect(await runReview({ octokit, log, llm, concurrency: 2 }, job)).toBe("posted");

    expect(posted).toHaveLength(2);
    expect(posted[0]).toContain("Building the review plan");
    expect(posted[1]).toContain("Adds a user lookup.");
    expect(posted[1]).toContain("Summary of Logic: src/api");
    expect(posted[1]).toContain("Summary of Logic: src/lib");
    expect(posted[1]).toContain("### Skim only");
    // The lockfile is skim-only, so it never goes to the AI.
    expect(llm.summarizeChunk).toHaveBeenCalledTimes(2);
  });

  it("keeps going when one chunk's summary fails", async () => {
    const { posted, octokit } = fakeGitHub(["abc", "abc"]);
    await runReview({ octokit, log, llm: fakeLLM("src/lib"), concurrency: 2 }, job);
    expect(posted[1]).toContain("Summary of Logic: src/api");
    expect(posted[1]).toContain("_Summary unavailable: the AI request failed._");
  });

  it("skips the review when the PR already has newer commits", async () => {
    const { posted, octokit } = fakeGitHub(["newer"]);
    expect(await runReview({ octokit, log, llm: fakeLLM(), concurrency: 2 }, job)).toBe("stale");
    expect(posted).toHaveLength(0);
  });

  it("drops the result when a push lands while the AI is working", async () => {
    const { posted, octokit } = fakeGitHub(["abc", "newer"]);
    expect(await runReview({ octokit, log, llm: fakeLLM(), concurrency: 2 }, job)).toBe("stale");
    expect(posted).toHaveLength(1); // only the progress message
  });
});
