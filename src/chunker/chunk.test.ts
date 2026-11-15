import { describe, expect, it } from "vitest";
import type { ChangedFile } from "../types.js";
import { buildChunks, DEFAULT_CHUNK_OPTIONS } from "./chunk.js";
import { classifyFile } from "./classify.js";

const changed = (path: string, lines = 2): ChangedFile => ({
  path,
  status: "modified",
  additions: lines,
  deletions: 0,
  patch: `@@ -1 +1,${lines + 1} @@\n a\n${"+x\n".repeat(lines)}`,
});
const chunksFor = (files: ChangedFile[], opts = DEFAULT_CHUNK_OPTIONS) => buildChunks(files.map(classifyFile), opts);

describe("buildChunks", () => {
  it("groups by role and folder, in reading order, with noise last", () => {
    const chunks = chunksFor([
      changed("README.md"),
      changed("src/api/users.test.ts"),
      changed("package-lock.json"),
      changed("src/api/users.ts"),
      changed("src/api/teams.ts"),
      changed("src/types.ts"),
      changed("package.json"),
      changed("src/lib/mail.ts"),
    ]);
    expect(chunks.map((c) => c.title)).toEqual([
      "Types and interfaces: src",
      "Logic: src/api",
      "Logic: src/lib",
      "Config: (root)",
      "Tests: src/api",
      "Docs: (root)",
      "Skim only: generated, lockfile and formatting changes",
    ]);
    expect(chunks.map((c) => c.id)).toEqual(chunks.map((_, i) => `chunk-${i + 1}`));
    expect(chunks[1].files.map((f) => f.path)).toEqual(["src/api/teams.ts", "src/api/users.ts"]);
    expect(chunks.at(-1)).toMatchObject({ skimOnly: true, files: [{ path: "package-lock.json" }] });
  });

  it("groups folders two levels deep", () => {
    const chunks = chunksFor([changed("src/api/v1/a.ts"), changed("src/api/v2/b.ts")]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].title).toBe("Logic: src/api");
  });

  it("splits a chunk that goes over the line limit, keeping files whole", () => {
    const opts = { ...DEFAULT_CHUNK_OPTIONS, maxChangedLines: 10 };
    const chunks = chunksFor([changed("src/a/1.ts", 6), changed("src/a/2.ts", 6), changed("src/a/3.ts", 3)], opts);
    expect(chunks.map((c) => c.title)).toEqual(["Logic: src/a (part 1 of 2)", "Logic: src/a (part 2 of 2)"]);
    expect(chunks.map((c) => c.files.map((f) => f.path))).toEqual([["src/a/1.ts"], ["src/a/2.ts", "src/a/3.ts"]]);
  });

  it("splits on patch size too", () => {
    const opts = { ...DEFAULT_CHUNK_OPTIONS, maxPatchChars: 30 };
    const chunks = chunksFor([changed("src/a/1.ts", 5), changed("src/a/2.ts", 5)], opts);
    expect(chunks).toHaveLength(2);
  });

  it("keeps a single oversized file as its own chunk", () => {
    const opts = { ...DEFAULT_CHUNK_OPTIONS, maxChangedLines: 10 };
    const chunks = chunksFor([changed("src/a/big.ts", 50)], opts);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].title).toBe("Logic: src/a");
  });

  it("returns nothing for an empty PR", () => {
    expect(chunksFor([])).toEqual([]);
  });
});
