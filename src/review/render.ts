// Builds the Markdown for the review-plan comment.

import { createHash } from "node:crypto";
import type { ClassifiedFile, NoiseReason, ReviewedChunk } from "../types.js";

/** Hidden line that lets us find our own comment again and update it. */
export const COMMENT_MARKER = "<!-- aicodechecker:review-plan -->";

/** GitHub rejects comments longer than 65,536 characters; leave some room. */
const MAX_COMMENT_CHARS = 60_000;

const NOISE_LABEL: Record<NoiseReason, string> = {
  lockfile: "lockfile",
  generated: "generated",
  vendored: "vendored",
  snapshot: "test snapshot",
  binary: "binary",
  empty: "empty file",
  "no-line-changes": "no line changes",
  rename: "renamed, no changes",
  whitespace: "formatting only",
};

export interface RenderInput {
  owner: string;
  repo: string;
  number: number;
  overview?: string;
  chunks: ReviewedChunk[];
}

/** Link to the file's diff on the PR's "Files changed" tab, at its first changed line. */
export function fileLink(input: RenderInput, file: ClassifiedFile): string {
  const anchor = createHash("sha256").update(file.path).digest("hex");
  // A deleted file has no new side, so point at the old side (L) instead of the new side (R).
  const oldStart = file.hunks[0]?.oldStart;
  const line =
    file.status === "removed" ? (oldStart ? `L${oldStart}` : "") : file.span && file.span[0] > 0 ? `R${file.span[0]}` : "";
  return `https://github.com/${input.owner}/${input.repo}/pull/${input.number}/files#diff-${anchor}${line}`;
}

/** Stops AI-written text from @-mentioning people or breaking out of the comment. */
function clean(text: string): string {
  return text.replace(/@(?=[\w-])/g, "@​").replace(/<!--/g, "&lt;!--").trim();
}

function fileEntry(input: RenderInput, file: ClassifiedFile): string {
  const warning = file.patchMissing ? " ⚠️ too large to summarize, read it directly" : "";
  return `[\`${file.path}\`](${fileLink(input, file)}) (+${file.additions} −${file.deletions})${warning}`;
}

function renderChunk(input: RenderInput, chunk: ReviewedChunk, index: number, compact: boolean): string {
  const lines: string[] = [];
  const headline = chunk.summary
    ? clean(chunk.summary.summary)
    : `_Summary unavailable${chunk.summaryError ? `: ${clean(chunk.summaryError)}` : ""}._`;
  lines.push(`- [ ] **${index}. ${chunk.title}** — ${headline}`);

  if (chunk.summary && !compact) {
    lines.push(`  - **Why:** ${clean(chunk.summary.why)}`);
    if (chunk.summary.checkClosely.length > 0) {
      lines.push(`  - **Check closely:** ${chunk.summary.checkClosely.map(clean).join("; ")}`);
    }
  }
  const files = compact
    ? `${chunk.files.length} file${chunk.files.length === 1 ? "" : "s"}`
    : chunk.files.map((f) => fileEntry(input, f)).join(", ");
  lines.push(`  - **Files:** ${files}`);
  return lines.join("\n");
}

function renderSkim(input: RenderInput, chunk: ReviewedChunk, compact: boolean): string {
  if (compact) return `### Skim only\n${chunk.files.length} files: lockfiles, generated code and formatting changes.`;
  const items = chunk.files.map((f) => `- ${fileEntry(input, f)}: ${NOISE_LABEL[f.noise ?? "generated"]}`);
  return `### Skim only\nThese changes are generated or cosmetic, so a quick look is enough.\n\n${items.join("\n")}`;
}

function render(input: RenderInput, compact: boolean, maxChunks: number): string {
  const review = input.chunks.filter((c) => !c.skimOnly);
  const skim = input.chunks.find((c) => c.skimOnly);
  const allFiles = input.chunks.flatMap((c) => c.files);
  const additions = allFiles.reduce((sum, f) => sum + f.additions, 0);
  const deletions = allFiles.reduce((sum, f) => sum + f.deletions, 0);

  const stats = [
    `${review.length} chunk${review.length === 1 ? "" : "s"} to review`,
    `${allFiles.length} file${allFiles.length === 1 ? "" : "s"}`,
    `+${additions} −${deletions}`,
  ];
  if (skim) stats.push(`${skim.files.length} to skim`);

  const parts = [COMMENT_MARKER, "## Review plan"];
  if (input.overview) parts.push(clean(input.overview));
  parts.push(`**${stats.join(" · ")}**`);
  parts.push("Read the chunks in this order: types first, then logic, then config, tests and docs.");

  const shown = review.slice(0, maxChunks).map((c, i) => renderChunk(input, c, i + 1, compact));
  if (review.length > maxChunks) {
    shown.push(`- _…and ${review.length - maxChunks} more chunks. The PR is too large to list them all in one comment._`);
  }
  if (shown.length > 0) parts.push(shown.join("\n"));
  if (skim) parts.push(renderSkim(input, skim, compact));

  return parts.join("\n\n") + "\n";
}

export function renderReviewPlan(input: RenderInput): string {
  // Full detail first; drop details, then chunks, until it fits GitHub's limit.
  const full = render(input, false, Infinity);
  if (full.length <= MAX_COMMENT_CHARS) return full;

  let maxChunks = input.chunks.length;
  let compact = render(input, true, maxChunks);
  while (compact.length > MAX_COMMENT_CHARS && maxChunks > 1) {
    maxChunks = Math.floor(maxChunks / 2);
    compact = render(input, true, maxChunks);
  }
  return compact;
}

/** Shown while the review is being built, so people know the app is working. */
export function renderInProgress(): string {
  return `${COMMENT_MARKER}\n## Review plan\n⏳ Building the review plan for this PR. This usually takes under a minute.\n`;
}

/** Replaces the in-progress message when the review couldn't be built. */
export function renderFailed(): string {
  return `${COMMENT_MARKER}\n## Review plan\n⚠️ The review plan couldn't be built this time. Push a new commit to try again.\n`;
}
