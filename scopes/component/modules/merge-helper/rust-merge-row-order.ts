import type { RustMergeRow } from './rust-merge-body-plan';

/** A complete permutation refers only to the privately retained, validated prepare rows. */
export function orderedRustMergeRows(value: any, rows: RustMergeRow[]): RustMergeRow[] | undefined {
  const indices = value?.rowIndices;
  if (!Array.isArray(indices) || indices.length !== rows.length) return undefined;
  const seen = new Set<number>();
  const ordered: RustMergeRow[] = [];
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= rows.length || seen.has(index)) return undefined;
    seen.add(index);
    ordered.push(rows[index]);
  }
  return ordered;
}

/** Preserve the original first-match identity, including duplicate rows, without scanning each time. */
export function rustMergeRowKey(row: RustMergeRow): string {
  return JSON.stringify([row.kind, row.current, row.other, row.base, row.bodyPlanIndex]);
}
