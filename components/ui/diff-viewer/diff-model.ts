import { diffLines } from 'diff';

export type DiffLineType = 'context' | 'add' | 'del';

/** one line in the diff, carrying its old/new line numbers and any intra-line changed char ranges. */
export type DiffLineItem = {
  type: DiffLineType;
  oldLn?: number;
  newLn?: number;
  text: string;
  /** half-open `[start, end)` character ranges that actually changed (paired add/del lines only). */
  intra?: Array<[number, number]>;
};

/** a contiguous block of rendered lines, or a collapsed gap of unchanged lines that can be expanded. */
export type DiffSection =
  | { kind: 'lines'; items: DiffLineItem[] }
  | { kind: 'gap'; id: string; hidden: DiffLineItem[] };

export type DiffStats = { additions: number; deletions: number };

const DEFAULT_CONTEXT = 3;

/**
 * Compute a full, line-aligned diff of two file contents — every line is present (context included),
 * with old/new line numbers assigned and intra-line changed ranges filled in for paired add/del
 * lines. Keeping the complete line list (rather than only hunks) lets collapsed gaps be expanded
 * later without recomputing.
 */
export function computeDiffLines(oldContent: string, newContent: string): DiffLineItem[] {
  const parts = diffLines(oldContent ?? '', newContent ?? '');
  const items: DiffLineItem[] = [];
  let oldLn = 1;
  let newLn = 1;

  for (const part of parts) {
    const lines = part.value.split('\n');
    // a trailing newline produces a spurious empty final element — drop it.
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    for (const text of lines) {
      if (part.added) items.push({ type: 'add', newLn: newLn++, text });
      else if (part.removed) items.push({ type: 'del', oldLn: oldLn++, text });
      else items.push({ type: 'context', oldLn: oldLn++, newLn: newLn++, text });
    }
  }

  fillIntraLineRanges(items);
  return items;
}

export function statsFromItems(items: DiffLineItem[]): DiffStats {
  let additions = 0;
  let deletions = 0;
  for (const it of items) {
    if (it.type === 'add') additions++;
    else if (it.type === 'del') deletions++;
  }
  return { additions, deletions };
}

/**
 * Within each change block (a run of deletions immediately followed by a run of additions), pair
 * `del[k]` with `add[k]` and compute character-level changes so a one-character edit is visible
 * instead of two near-identical lines (GitHub's intra-line highlight).
 */
function fillIntraLineRanges(items: DiffLineItem[]): void {
  let i = 0;
  while (i < items.length) {
    if (items[i].type !== 'del') {
      i++;
      continue;
    }
    let d = i;
    while (d < items.length && items[d].type === 'del') d++;
    let a = d;
    while (a < items.length && items[a].type === 'add') a++;
    const dels = items.slice(i, d);
    const adds = items.slice(d, a);
    const pairs = Math.min(dels.length, adds.length);
    for (let k = 0; k < pairs; k++) {
      const { delRanges, addRanges } = intraLineDiff(dels[k].text, adds[k].text);
      // skip the highlight when essentially the whole line changed — it's just noise then.
      if (!coversWholeLine(delRanges, dels[k].text.length)) dels[k].intra = delRanges;
      if (!coversWholeLine(addRanges, adds[k].text.length)) adds[k].intra = addRanges;
    }
    i = a > i ? a : i + 1;
  }
}

function coversWholeLine(ranges: Array<[number, number]>, len: number): boolean {
  if (len === 0) return true;
  const changed = ranges.reduce((sum, [s, e]) => sum + (e - s), 0);
  return changed >= len * 0.9;
}

/** split a line into word / whitespace / punctuation tokens so the diff aligns on real boundaries. */
function tokenizeLine(s: string): string[] {
  return s.match(/[A-Za-z0-9_$]+|\s+|[^A-Za-z0-9_$\s]/g) || [];
}

/**
 * Token-level (word) diff of two lines via an LCS walk, returning the half-open character ranges that
 * changed on each side. Adjacent changed ranges are merged so the highlight reads as one span.
 */
export function intraLineDiff(
  from: string,
  to: string
): { delRanges: Array<[number, number]>; addRanges: Array<[number, number]> } {
  const a = tokenizeLine(from);
  const b = tokenizeLine(to);
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const delRanges: Array<[number, number]> = [];
  const addRanges: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  let aOff = 0;
  let bOff = 0;
  const pushChanged = (ranges: Array<[number, number]>, off: number, tok: string) => {
    if (!tok.trim()) return; // don't emphasize whitespace-only tokens
    const last = ranges[ranges.length - 1];
    if (last && last[1] === off) last[1] = off + tok.length;
    else ranges.push([off, off + tok.length]);
  };
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      aOff += a[i].length;
      bOff += b[j].length;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushChanged(delRanges, aOff, a[i]);
      aOff += a[i].length;
      i++;
    } else {
      pushChanged(addRanges, bOff, b[j]);
      bOff += b[j].length;
      j++;
    }
  }
  while (i < m) {
    pushChanged(delRanges, aOff, a[i]);
    aOff += a[i].length;
    i++;
  }
  while (j < n) {
    pushChanged(addRanges, bOff, b[j]);
    bOff += b[j].length;
    j++;
  }
  return { delRanges, addRanges };
}

/**
 * Group the full line list into rendered line-blocks and collapsible gaps of unchanged lines. Long
 * stretches of unchanged code between changes are collapsed to `context` lines on each side; the rest
 * becomes a `gap` that can be expanded on demand.
 */
export function buildSections(items: DiffLineItem[], context: number = DEFAULT_CONTEXT): DiffSection[] {
  const changedIdx: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].type !== 'context') changedIdx.push(i);
  }
  if (changedIdx.length === 0) {
    // an unchanged file: collapse everything into one expandable gap.
    return items.length ? [{ kind: 'gap', id: 'gap-all', hidden: items }] : [];
  }

  const sections: DiffSection[] = [];
  const first = changedIdx[0];
  const last = changedIdx[changedIdx.length - 1];

  // leading unchanged region (file start → first change)
  emitUnchanged(sections, items, 0, first, context, 'lead');

  // changed region plus interleaved unchanged gaps
  let cursor = first;
  while (cursor <= last) {
    // emit the maximal run of "visible" lines starting at cursor: changed lines plus short gaps.
    const runStart = cursor;
    let runEnd = cursor;
    while (runEnd <= last) {
      if (items[runEnd].type !== 'context') {
        runEnd++;
        continue;
      }
      // measure the unchanged stretch
      let u = runEnd;
      while (u <= last && items[u].type === 'context') u++;
      const gapLen = u - runEnd;
      if (gapLen <= context * 2) {
        runEnd = u; // short gap — keep inline
      } else {
        break; // long gap — end this run, collapse below
      }
    }
    sections.push({ kind: 'lines', items: items.slice(runStart, runEnd) });
    if (runEnd > last) {
      cursor = runEnd;
      break;
    }
    // collapse the long unchanged stretch, keeping `context` lines on each side
    let u = runEnd;
    while (u <= last && items[u].type === 'context') u++;
    const keepTopEnd = runEnd + context;
    const keepBottomStart = u - context;
    sections.push({ kind: 'lines', items: items.slice(runEnd, keepTopEnd) });
    sections.push({ kind: 'gap', id: `gap-${runEnd}`, hidden: items.slice(keepTopEnd, keepBottomStart) });
    sections.push({ kind: 'lines', items: items.slice(keepBottomStart, u) });
    cursor = u;
  }

  // trailing unchanged region (last change → file end)
  emitUnchanged(sections, items, last + 1, items.length, context, 'trail');

  return sections;
}

function emitUnchanged(
  sections: DiffSection[],
  items: DiffLineItem[],
  start: number,
  end: number,
  context: number,
  edge: 'lead' | 'trail'
): void {
  const len = end - start;
  if (len <= 0) return;
  if (len <= context) {
    sections.push({ kind: 'lines', items: items.slice(start, end) });
    return;
  }
  if (edge === 'lead') {
    sections.push({ kind: 'gap', id: `gap-${start}`, hidden: items.slice(start, end - context) });
    sections.push({ kind: 'lines', items: items.slice(end - context, end) });
  } else {
    sections.push({ kind: 'lines', items: items.slice(start, start + context) });
    sections.push({ kind: 'gap', id: `gap-${start}`, hidden: items.slice(start + context, end) });
  }
}

export type SplitRow = { left?: DiffLineItem; right?: DiffLineItem };

/**
 * Pair lines for side-by-side rendering: deletions align to the left column, additions to the right,
 * context lines occupy both. Unbalanced add/del runs leave an empty cell on the shorter side.
 */
export function pairForSplit(items: DiffLineItem[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    if (it.type === 'context') {
      rows.push({ left: it, right: it });
      i++;
      continue;
    }
    const dels: DiffLineItem[] = [];
    const adds: DiffLineItem[] = [];
    while (i < items.length && items[i].type === 'del') dels.push(items[i++]);
    while (i < items.length && items[i].type === 'add') adds.push(items[i++]);
    const max = Math.max(dels.length, adds.length);
    for (let k = 0; k < max; k++) rows.push({ left: dels[k], right: adds[k] });
  }
  return rows;
}
