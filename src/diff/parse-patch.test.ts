import { describe, expect, it } from "vitest";
import { changedSpan, isWhitespaceOnly, parsePatch } from "./parse-patch.js";

describe("parsePatch", () => {
  it("reads hunk headers and tracks new-file line numbers for added lines", () => {
    const patch = ["@@ -10,4 +10,5 @@ function a()", " keep", "-old", "+new1", "+new2", " keep", " keep"].join("\n");
    const [hunk] = parsePatch(patch);
    expect(hunk).toMatchObject({ oldStart: 10, oldLines: 4, newStart: 10, newLines: 5 });
    expect(hunk.added).toEqual(["new1", "new2"]);
    expect(hunk.removed).toEqual(["old"]);
    expect(hunk.addedRanges).toEqual([[11, 12]]);
  });

  it("splits added lines separated by context into separate ranges", () => {
    const patch = ["@@ -1,3 +1,5 @@", "+a", " x", " y", "+b", "+c"].join("\n");
    expect(parsePatch(patch)[0].addedRanges).toEqual([
      [1, 1],
      [4, 5],
    ]);
  });

  it("treats a missing line count as 1 and handles several hunks", () => {
    const patch = ["@@ -1 +1 @@", "-a", "+b", "@@ -20,2 +20,3 @@", " x", "+y", " z"].join("\n");
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toMatchObject({ oldLines: 1, newLines: 1 });
    expect(hunks[1].addedRanges).toEqual([[21, 21]]);
  });

  it("ignores the 'No newline at end of file' marker", () => {
    const patch = ["@@ -1 +1 @@", "-a", "\\ No newline at end of file", "+b"].join("\n");
    const [hunk] = parsePatch(patch);
    expect(hunk.removed).toEqual(["a"]);
    expect(hunk.added).toEqual(["b"]);
  });
});

describe("changedSpan", () => {
  it("spans from the first to the last added line", () => {
    const hunks = parsePatch(["@@ -1,2 +1,3 @@", "+a", " x", "@@ -50 +51,2 @@", " y", "+z"].join("\n"));
    expect(changedSpan(hunks)).toEqual([1, 52]);
  });

  it("points at the removal site for a deletion-only patch", () => {
    expect(changedSpan(parsePatch("@@ -5,2 +4,0 @@\n-a\n-b"))).toEqual([4, 4]);
  });

  it("is undefined with no hunks", () => {
    expect(changedSpan([])).toBeUndefined();
  });
});

describe("isWhitespaceOnly", () => {
  it("is true for re-indentation", () => {
    expect(isWhitespaceOnly(parsePatch("@@ -1 +1 @@\n-  foo();\n+    foo();"))).toBe(true);
  });

  it("is false for a real change", () => {
    expect(isWhitespaceOnly(parsePatch("@@ -1 +1 @@\n-foo();\n+bar();"))).toBe(false);
  });

  it("is false with no hunks", () => {
    expect(isWhitespaceOnly([])).toBe(false);
  });
});
