// Posts the review-plan comment, or updates the one we posted before,
// so each push to the PR edits a single comment instead of adding a new one.

import type { ProbotOctokit } from "probot";
import { COMMENT_MARKER } from "../review/render.js";
import type { PullRequestRef } from "./fetch-pr.js";

/** Finds our earlier review-plan comment on the PR, if there is one. */
export async function findReviewComment(
  octokit: ProbotOctokit,
  { owner, repo, pullNumber }: PullRequestRef,
): Promise<number | undefined> {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: pullNumber,
    per_page: 100,
  });
  // Only a bot's comment counts, so a person quoting our marker can't hijack it.
  const ours = comments.find((c) => c.user?.type === "Bot" && c.body?.includes(COMMENT_MARKER));
  return ours?.id;
}

/** Creates or updates the review-plan comment and returns its id. */
export async function upsertReviewComment(
  octokit: ProbotOctokit,
  ref: PullRequestRef,
  body: string,
  commentId?: number,
): Promise<number> {
  const existing = commentId ?? (await findReviewComment(octokit, ref));
  if (existing !== undefined) {
    await octokit.rest.issues.updateComment({
      owner: ref.owner,
      repo: ref.repo,
      comment_id: existing,
      body,
    });
    return existing;
  }
  const { data } = await octokit.rest.issues.createComment({
    owner: ref.owner,
    repo: ref.repo,
    issue_number: ref.pullNumber,
    body,
  });
  return data.id;
}
