// Asks the GitHub API for everything the pipeline needs about one pull request:
// title, description, changed files with their diffs, and linked issues.

import type { ProbotOctokit } from "probot";
import type { ChangedFile, FileStatus, LinkedIssue, PullRequestData } from "../types.js";

/** Most linked issues we fetch, so a PR that lists dozens doesn't slow things down. */
const MAX_LINKED_ISSUES = 5;

// "fixes #12", "Closes owner/repo#12", "resolved #12" ... (GitHub's own closing keywords)
const CLOSING_REFERENCE =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+(?:([\w.-]+)\/([\w.-]+))?#(\d+)/gi;

/** Issue numbers the PR description says it closes. Only issues in the same repo. */
export function linkedIssueNumbers(body: string, owner: string, repo: string): number[] {
  const numbers = new Set<number>();
  for (const match of body.matchAll(CLOSING_REFERENCE)) {
    const [, refOwner, refRepo, number] = match;
    const sameRepo =
      !refOwner ||
      (refOwner.toLowerCase() === owner.toLowerCase() && refRepo.toLowerCase() === repo.toLowerCase());
    if (sameRepo) numbers.add(Number(number));
  }
  return [...numbers].slice(0, MAX_LINKED_ISSUES);
}

export interface PullRequestRef {
  owner: string;
  repo: string;
  pullNumber: number;
}

export async function fetchPullRequest(
  octokit: ProbotOctokit,
  { owner, repo, pullNumber }: PullRequestRef,
): Promise<PullRequestData> {
  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });

  // GitHub returns at most 3,000 files for a PR; paginate walks every page up to that.
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  const body = pr.body ?? "";
  const linkedIssues = await fetchIssues(octokit, owner, repo, linkedIssueNumbers(body, owner, repo));

  return {
    owner,
    repo,
    number: pullNumber,
    title: pr.title,
    body,
    headSha: pr.head.sha,
    linkedIssues,
    files: files.map(
      (f): ChangedFile => ({
        path: f.filename,
        previousPath: f.previous_filename,
        status: f.status as FileStatus,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      }),
    ),
  };
}

async function fetchIssues(
  octokit: ProbotOctokit,
  owner: string,
  repo: string,
  numbers: number[],
): Promise<LinkedIssue[]> {
  const issues = await Promise.all(
    numbers.map(async (issueNumber): Promise<LinkedIssue | undefined> => {
      try {
        const { data } = await octokit.rest.issues.get({ owner, repo, issue_number: issueNumber });
        // "#12" can point at another PR rather than an issue; that's not useful context here.
        if (data.pull_request) return undefined;
        return { number: data.number, title: data.title, body: data.body ?? "" };
      } catch (error) {
        // A deleted or private issue shouldn't stop the review.
        const status = (error as { status?: number }).status;
        if (status === 404 || status === 410) return undefined;
        throw error;
      }
    }),
  );
  return issues.filter((issue): issue is LinkedIssue => issue !== undefined);
}
