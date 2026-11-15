import type { Probot } from "probot";
import { describe, expect, it, vi } from "vitest";
import { createApp, REVIEW_EVENTS } from "./index.js";
import type { LLMProvider } from "./llm/provider.js";
import { ReviewQueue } from "./queue.js";

function fakeProbot() {
  const handlers: Array<{ events: string[]; fn: (context: unknown) => Promise<void> }> = [];
  const log = { info: vi.fn(), error: vi.fn(), child: () => log };
  const app = { log, on: vi.fn((events, fn) => handlers.push({ events, fn })) };
  return { app: app as unknown as Probot, handlers, log };
}

const context = (number: number, sha: string) => {
  const log = { info: vi.fn(), child: () => log };
  return {
    name: "pull_request",
    octokit: { fake: true },
    log,
    payload: {
      action: "synchronize",
      pull_request: { number, head: { sha } },
      repository: { name: "app", owner: { login: "me" } },
    },
  };
};

describe("createApp", () => {
  const llm = {} as LLMProvider;

  it("listens for opened, reopened and synchronize events", () => {
    const { app, handlers } = fakeProbot();
    createApp({ llm, review: vi.fn(), env: {} })(app, {} as never);
    expect(handlers).toHaveLength(1);
    expect(handlers[0].events).toEqual([...REVIEW_EVENTS]);
  });

  it("queues a review with the PR's details and returns without waiting for it", async () => {
    const { app, handlers, log } = fakeProbot();
    let finish!: () => void;
    const review = vi.fn(() => new Promise<"posted">((resolve) => (finish = () => resolve("posted"))));
    const queue = new ReviewQueue(log, 2);
    createApp({ llm, review, queue, env: { LLM_CONCURRENCY: "3" } })(app, {} as never);

    await handlers[0].fn(context(7, "abc1234567"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({ octokit: { fake: true }, llm, concurrency: 3 }),
      { owner: "me", repo: "app", pullNumber: 7, headSha: "abc1234567" },
    );
    expect(queue.size.running).toBe(1); // handler returned while the review is still running
    finish();
    await queue.onIdle();
  });

  it("rejects a bad concurrency setting at startup", () => {
    const { app } = fakeProbot();
    expect(() => createApp({ llm, review: vi.fn(), env: { LLM_CONCURRENCY: "zero" } })(app, {} as never)).toThrow(
      /LLM_CONCURRENCY/,
    );
  });
});
