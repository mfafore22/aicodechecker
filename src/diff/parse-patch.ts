// Parses the unified-diff `patch` string GitHub returns for each file in a PR.

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  added: string[];
  removed: string[];
  /** Line ranges in the new file that contain added lines, for linking. */
  addedRanges: Array<[start: number, end: number]>;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parsePatch(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  let current: Hunk | undefined;
  let newLine = 0;

  for (const line of patch.split("\n")) {
    const header = HUNK_HEADER.exec(line);
    if (header) {
      current = {
        oldStart: Number(header[1]),
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        added: [],
        removed: [],
        addedRanges: [],
      };
      newLine = current.newStart;
      hunks.push(current);
      continue;
    }
    if (!current || line.startsWith("\\")) continue; // "\ No newline at end of file"

    if (line.startsWith("+")) {
      current.added.push(line.slice(1));
      const last = current.addedRanges.at(-1);
      if (last && last[1] === newLine - 1) last[1] = newLine;
      else current.addedRanges.push([newLine, newLine]);
      newLine++;
    } else if (line.startsWith("-")) {
      current.removed.push(line.slice(1));
    } else {
      newLine++;
    }
  }
  return hunks;
}

/** The first and last new-file lines touched by the patch, for a "jump to change" link. */
export function changedSpan(hunks: Hunk[]): [number, number] | undefined {
  const ranges = hunks.flatMap((h) => h.addedRanges);
  if (ranges.length > 0) return [ranges[0][0], ranges.at(-1)![1]];
  // Deletion-only patch: point at where the removed code used to be.
  if (hunks.length > 0) return [hunks[0].newStart, hunks[0].newStart];
  return undefined;
}

/** True when every hunk only changes whitespace (re-indentation, trailing spaces, line wrapping). */
export function isWhitespaceOnly(hunks: Hunk[]): boolean {
  if (hunks.length === 0) return false;
  const squash = (lines: string[]) => lines.join("").replace(/\s+/g, "");
  return hunks.every((h) => squash(h.added) === squash(h.removed));
}
