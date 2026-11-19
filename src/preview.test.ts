import { describe, expect, it } from "vitest";
import { parsePullRequestRef } from "./preview.js";

describe("parsePullRequestRef", () => {
  it.each([
    ["octo/app#12", { owner: "octo", repo: "app", pullNumber: 12 }],
    ["https://github.com/octo/my.app/pull/7", { owner: "octo", repo: "my.app", pullNumber: 7 }],
    ["https://github.com/octo/app/pull/7/files", { owner: "octo", repo: "app", pullNumber: 7 }],
    ["  octo/app#3 ", { owner: "octo", repo: "app", pullNumber: 3 }],
  ])("reads %s", (input, ref) => {
    expect(parsePullRequestRef(input)).toEqual(ref);
  });

  it.each(["octo/app", "#12", "https://github.com/octo/app/issues/7", "https://evil.com/octo/app/pull/1"])(
    "rejects %s",
    (input) => {
      expect(parsePullRequestRef(input)).toBeUndefined();
    },
  );
});
