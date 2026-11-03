import { describe, expect, it } from "vitest";
import { linkedIssueNumbers } from "./fetch-pr.js";

describe("linkedIssueNumbers", () => {
  it("finds GitHub's closing keywords", () => {
    const body = "Fixes #12. Also closes #7 and resolved #3.";
    expect(linkedIssueNumbers(body, "me", "app")).toEqual([12, 7, 3]);
  });

  it("ignores plain mentions without a closing keyword", () => {
    expect(linkedIssueNumbers("See #12 for context", "me", "app")).toEqual([]);
  });

  it("keeps same-repo references and drops other repos", () => {
    const body = "fixes me/app#4, fixes other/lib#5";
    expect(linkedIssueNumbers(body, "me", "app")).toEqual([4]);
  });

  it("counts an issue once and caps the list at 5", () => {
    const body = "fixes #1 fixes #1 fixes #2 fixes #3 fixes #4 fixes #5 fixes #6";
    expect(linkedIssueNumbers(body, "me", "app")).toEqual([1, 2, 3, 4, 5]);
  });
});
