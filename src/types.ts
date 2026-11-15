import type { Hunk } from "./diff/parse-patch.js";

export type FileStatus =
  | "added"
  | "removed"
  | "modified"
  | "renamed"
  | "copied"
  | "changed"
  | "unchanged";

export interface ChangedFile {
  path: string;
  previousPath?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  /** GitHub leaves this out for binary files and for diffs too large to return. */
  patch?: string;
}

export interface LinkedIssue {
  number: number;
  title: string;
  body: string;
}

export interface PullRequestData {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  headSha: string;
  linkedIssues: LinkedIssue[];
  files: ChangedFile[];
}

/** What kind of code a file holds, which decides where it goes in the reading order. */
export type FileRole = "types" | "source" | "config" | "test" | "docs";

export type NoiseReason =
  | "lockfile"
  | "generated"
  | "vendored"
  | "snapshot"
  | "binary"
  | "empty"
  | "no-line-changes"
  | "rename"
  | "whitespace";

export interface ClassifiedFile extends ChangedFile {
  role: FileRole;
  /** Set when the change is noise a reviewer only needs to skim. */
  noise?: NoiseReason;
  /** True when GitHub returned no patch for a text change, so the LLM can't see it. */
  patchMissing: boolean;
  hunks: Hunk[];
  /** First and last changed lines in the new file. */
  span?: [number, number];
}

export interface Chunk {
  id: string;
  title: string;
  role: FileRole;
  skimOnly: boolean;
  files: ClassifiedFile[];
}

export interface ChunkSummary {
  summary: string;
  why: string;
  checkClosely: string[];
}

export interface ReviewedChunk extends Chunk {
  /** Missing for skim-only chunks, or when summarizing failed. */
  summary?: ChunkSummary;
  /** Why there is no summary, when one was expected. */
  summaryError?: string;
}
