// MVP chunking: group files by role and folder, then order the groups for reading.
// Phase 2 replaces the folder grouping with tree-sitter symbols and dependency links.

import type { Chunk, ClassifiedFile, FileRole } from "../types.js";

/** Reading order: contracts first, then the logic, then how it's wired up and tested. */
const ROLE_ORDER: FileRole[] = ["types", "source", "config", "test", "docs"];

const ROLE_LABEL: Record<FileRole, string> = {
  types: "Types and interfaces",
  source: "Logic",
  config: "Config",
  test: "Tests",
  docs: "Docs",
};

export interface ChunkOptions {
  /** Folder depth used to group files. 2 groups `src/api/users.ts` under `src/api`. */
  folderDepth: number;
  /** A chunk is split once its changed lines go past this. */
  maxChangedLines: number;
  /** A chunk is split once its patches go past this many characters (keeps prompts small). */
  maxPatchChars: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  folderDepth: 2,
  maxChangedLines: 400,
  maxPatchChars: 60_000,
};

function folderOf(path: string, depth: number): string {
  const parts = path.split("/").slice(0, -1);
  return parts.length === 0 ? "(root)" : parts.slice(0, depth).join("/");
}

const changedLines = (f: ClassifiedFile) => f.additions + f.deletions;

/** Splits a group into pieces under the size limits, keeping files whole and in order. */
function splitBySize(files: ClassifiedFile[], opts: ChunkOptions): ClassifiedFile[][] {
  const pieces: ClassifiedFile[][] = [];
  let current: ClassifiedFile[] = [];
  let lines = 0;
  let chars = 0;
  for (const file of files) {
    const fileChars = file.patch?.length ?? 0;
    const overLimit =
      lines + changedLines(file) > opts.maxChangedLines || chars + fileChars > opts.maxPatchChars;
    if (current.length > 0 && overLimit) {
      pieces.push(current);
      current = [];
      lines = 0;
      chars = 0;
    }
    current.push(file);
    lines += changedLines(file);
    chars += fileChars;
  }
  if (current.length > 0) pieces.push(current);
  return pieces;
}

export function buildChunks(
  files: ClassifiedFile[],
  opts: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): Chunk[] {
  const noise = files.filter((f) => f.noise);
  const groups = new Map<string, { role: FileRole; folder: string; files: ClassifiedFile[] }>();

  for (const file of files.filter((f) => !f.noise)) {
    const folder = folderOf(file.path, opts.folderDepth);
    const key = `${file.role}\0${folder}`;
    const group = groups.get(key) ?? { role: file.role, folder, files: [] };
    group.files.push(file);
    groups.set(key, group);
  }

  const ordered = [...groups.values()].sort(
    (a, b) =>
      ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.folder.localeCompare(b.folder),
  );

  const chunks: Omit<Chunk, "id">[] = [];
  for (const group of ordered) {
    const sorted = [...group.files].sort((a, b) => a.path.localeCompare(b.path));
    const pieces = splitBySize(sorted, opts);
    pieces.forEach((piece, i) => {
      const part = pieces.length > 1 ? ` (part ${i + 1} of ${pieces.length})` : "";
      chunks.push({
        title: `${ROLE_LABEL[group.role]}: ${group.folder}${part}`,
        role: group.role,
        skimOnly: false,
        files: piece,
      });
    });
  }

  if (noise.length > 0) {
    chunks.push({
      title: "Skim only: generated, lockfile and formatting changes",
      role: "config",
      skimOnly: true,
      files: [...noise].sort((a, b) => a.path.localeCompare(b.path)),
    });
  }

  return chunks.map((chunk, i) => ({ id: `chunk-${i + 1}`, ...chunk }));
}
