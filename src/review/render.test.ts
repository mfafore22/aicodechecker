import { describe, expect, it } from "vitest";
import { buildChunks } from "../chunker/chunk.js";
import { classifyFile } from "../chunker/classify.js";
import type { ReviewedChunk } from "../types.js";
import { COMMENT_MARKER, renderReviewPlan } from "./render.js";

const pr = { owner: "me", repo: "app", number: 7 };

function sampleChunks(): ReviewedChunk[] {
  const files = [
    { path: "src/api/users.ts", status: "modified" as const, additions: 2, deletions: 1, patch: "@@ -1,2 +1,3 @@\n a\n-b\n+c\n+d" },
    { path: "package-lock.json", status: "modified" as const, additions: 900, deletions: 400, patch: "@@ -1 +1 @@\n-x\n+y" },
  ].map(classifyFile);
  return buildChunks(files).map((chunk) =>
    chunk.skimOnly
      ? chunk
      : { ...chunk, summary: { summary: "Adds a user lookup.", why: "Fixes #3.", checkClosely: ["Missing users", "ping @alice"] } },
  );
}

describe("renderReviewPlan", () => {
  it("lists chunks as a checklist with links, and noise under Skim only", () => {
    const md = renderReviewPlan({ ...pr, overview: "Adds user lookup.", chunks: sampleChunks() });
    expect(md.startsWith(COMMENT_MARKER)).toBe(true);
    expect(md).toContain("- [ ] **1. Logic: src/api** — Adds a user lookup.");
    expect(md).toContain("**Why:** Fixes #3.");
    expect(md).toMatch(/\[`src\/api\/users\.ts`\]\(https:\/\/github\.com\/me\/app\/pull\/7\/files#diff-[0-9a-f]{64}R2\)/);
    expect(md).toContain("### Skim only");
    expect(md).toContain("`package-lock.json`");
    expect(md).toContain(": lockfile");
  });

  it("doesn't let AI text @-mention people", () => {
    const md = renderReviewPlan({ ...pr, chunks: sampleChunks() });
    expect(md).not.toContain("@alice");
  });

  it("says when a summary is missing", () => {
    const chunks = sampleChunks().map((c) => (c.skimOnly ? c : { ...c, summary: undefined, summaryError: "rate limited" }));
    expect(renderReviewPlan({ ...pr, chunks })).toContain("_Summary unavailable: rate limited._");
  });

  it("stays under GitHub's comment size limit for huge PRs", () => {
    const [chunk] = sampleChunks();
    const many = Array.from({ length: 3000 }, (_, i) => ({ ...chunk, id: `c${i}`, title: `Logic: folder${i}` }));
    const md = renderReviewPlan({ ...pr, chunks: many });
    expect(md.length).toBeLessThanOrEqual(60_000);
    expect(md).toContain("more chunks");
  });
});
