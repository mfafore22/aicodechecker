import type { ProbotOctokit } from "probot";
import { describe, expect, it, vi } from "vitest";
import { COMMENT_MARKER } from "../review/render.js";
import { upsertReviewComment } from "./comment.js";

const ref = { owner: "me", repo: "app", pullNumber: 7 };

function fakeOctokit(existing: Array<{ id: number; body: string; user: { type: string } }>) {
  const fake = {
    paginate: vi.fn(async () => existing),
    rest: {
      issues: {
        listComments: vi.fn(),
        createComment: vi.fn(async () => ({ data: { id: 99 } })),
        updateComment: vi.fn(async () => ({ data: {} })),
      },
    },
  };
  return { fake, octokit: fake as unknown as ProbotOctokit };
}

describe("upsertReviewComment", () => {
  it("creates a comment when there is none", async () => {
    const { fake, octokit } = fakeOctokit([]);
    expect(await upsertReviewComment(octokit, ref, "plan")).toBe(99);
    expect(fake.rest.issues.createComment).toHaveBeenCalledWith({ owner: "me", repo: "app", issue_number: 7, body: "plan" });
    expect(fake.rest.issues.updateComment).not.toHaveBeenCalled();
  });

  it("updates our earlier comment instead of adding a new one", async () => {
    const { fake, octokit } = fakeOctokit([
      { id: 1, body: "hello", user: { type: "User" } },
      { id: 2, body: `${COMMENT_MARKER}\nold plan`, user: { type: "Bot" } },
    ]);
    expect(await upsertReviewComment(octokit, ref, "new plan")).toBe(2);
    expect(fake.rest.issues.updateComment).toHaveBeenCalledWith({ owner: "me", repo: "app", comment_id: 2, body: "new plan" });
    expect(fake.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it("ignores a person's comment that contains the marker", async () => {
    const { fake, octokit } = fakeOctokit([{ id: 3, body: COMMENT_MARKER, user: { type: "User" } }]);
    await upsertReviewComment(octokit, ref, "plan");
    expect(fake.rest.issues.createComment).toHaveBeenCalled();
  });
});
