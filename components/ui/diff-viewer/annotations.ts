import type { ReactNode } from 'react';

/** which side of the diff a line number refers to. */
export type DiffLineSide = 'old' | 'new';

/**
 * A multi-line text selection captured from the rendered diff at the moment a line action fires.
 * Line numbers are on the same side as the gutter that was acted on.
 */
export type DiffLineSelection = {
  startLine: number;
  endLine: number;
  text: string;
};

/** the line a gutter action was invoked on, plus any text selection that covered it. */
export type DiffLineContext = {
  fileName: string;
  side: DiffLineSide;
  line: number;
  /** the line's source text on `side`. */
  text: string;
  /** present only when the action was invoked while a multi-line selection was active. */
  selection?: DiffLineSelection;
};

/**
 * Host-supplied decoration for a single line: content in its gutter, a full-width block rendered
 * under it, and/or a highlighted range it owns. The viewer stays presentational — it renders what it
 * is handed and reports line actions back; all meaning (review feedback, blame, coverage…) lives in
 * the host.
 */
export type DiffAnnotation = {
  id?: string;
  /** line number this annotation is anchored to (default side is `new`). */
  line: number;
  side?: DiffLineSide;
  /** inline content for the line's gutter, e.g. a commenter avatar. */
  gutter?: ReactNode;
  /** full-width block rendered directly beneath the line, e.g. a comment thread or compose form. */
  widget?: ReactNode;
  /** a contiguous span of lines this annotation covers, tinted while it is present. */
  range?: { start: number; end: number };
  /** emphasize this annotation's line (and range), e.g. the feedback addressed by the URL. */
  active?: boolean;
};

export type AnnotationIndex = {
  gutter: Map<string, ReactNode[]>;
  widget: Map<string, ReactNode[]>;
  range: Set<string>;
  active: Set<string>;
  /**
   * the lines that stay visible when unchanged code collapses: each annotation's anchor line and every
   * line of its range, so a highlighted span is never cut by a gap.
   */
  anchored: Set<string>;
  /** widgets make rows variable-height, which is incompatible with fixed-row virtualization. */
  hasWidgets: boolean;
};

export const EMPTY_ANNOTATION_INDEX: AnnotationIndex = {
  gutter: new Map(),
  widget: new Map(),
  range: new Set(),
  active: new Set(),
  anchored: new Set(),
  hasWidgets: false,
};

export function lineKey(side: DiffLineSide, line: number): string {
  return `${side}:${line}`;
}

/** Bucket annotations by side+line so row rendering is a map lookup rather than a scan per line. */
export function buildAnnotationIndex(annotations?: DiffAnnotation[]): AnnotationIndex {
  if (!annotations || annotations.length === 0) return EMPTY_ANNOTATION_INDEX;

  const index: AnnotationIndex = {
    gutter: new Map(),
    widget: new Map(),
    range: new Set(),
    active: new Set(),
    anchored: new Set(),
    hasWidgets: false,
  };

  for (const annotation of annotations) {
    // a host-supplied line that is not a positive whole number cannot match any row.
    if (!isLineNumber(annotation.line)) continue;
    const side = annotation.side ?? 'new';
    const key = lineKey(side, annotation.line);
    index.anchored.add(key);

    if (annotation.gutter) push(index.gutter, key, annotation.gutter);
    if (annotation.widget) {
      push(index.widget, key, annotation.widget);
      index.hasWidgets = true;
    }

    // a range that is not finite, is reversed or is implausibly long falls back to the anchor line:
    // every line in it is added to a set, so a bad endpoint would otherwise stall the render.
    const range = validRange(annotation.range);
    const from = range?.start ?? annotation.line;
    const to = range?.end ?? annotation.line;
    // a range is only meaningful when it spans more than the anchor line itself.
    if (range) {
      for (let line = from; line <= to; line++) {
        index.range.add(lineKey(side, line));
        index.anchored.add(lineKey(side, line));
      }
    }
    if (annotation.active) {
      for (let line = from; line <= to; line++) index.active.add(lineKey(side, line));
    }
  }

  return index;
}

/** the longest range an annotation may tint; longer ones fall back to their anchor line. */
const MAX_ANNOTATION_RANGE = 10_000;

function isLineNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function validRange(range?: { start: number; end: number }): { start: number; end: number } | undefined {
  if (!range || !isLineNumber(range.start) || !isLineNumber(range.end)) return undefined;
  if (range.end < range.start || range.end - range.start > MAX_ANNOTATION_RANGE) return undefined;
  return range;
}

function push(map: Map<string, ReactNode[]>, key: string, node: ReactNode) {
  const existing = map.get(key);
  if (existing) existing.push(node);
  else map.set(key, [node]);
}

/** the attribute a row (unified) or side cell (split) carries its line number on, per side. */
export function lineAttribute(side: DiffLineSide): string {
  return `data-diff-${side}-line`;
}

/**
 * Read the live text selection and, if it covers more than one line of this diff, resolve it to the
 * first/last line numbers on `side` and the selected text on that side.
 *
 * Each row (unified) or side cell (split) carries its line number. A line counts only when the
 * selection covers some of the text in that line's code cell, so:
 * - a selection that ends at the very start of the next line does not add that line, and
 * - in a unified diff, lines of the other side (e.g. removed lines for a new-side action) add neither
 *   their numbers nor their text.
 *
 * Returns undefined when there is no selection, it stays within one line, it does not cover `line`
 * (when given), or there is no window (SSR).
 */
export function captureDiffSelection(
  side: DiffLineSide,
  root?: Element | null,
  line?: number
): DiffLineSelection | undefined {
  if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
  if (typeof window.getSelection !== 'function') return undefined;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return undefined;
  const range = selection.getRangeAt(0);

  const scope = root ?? document.body;
  const attribute = lineAttribute(side);
  const selected: Array<{ line: number; text: string }> = [];

  for (const row of Array.from(scope.querySelectorAll(`[${attribute}]`))) {
    const rowLine = Number(row.getAttribute(attribute));
    if (!isLineNumber(rowLine)) continue;
    // the row's own source cell. A plain `querySelector('code')` could match a `<code>` inside a
    // host-supplied gutter badge, which comes first in the row.
    const code = row.querySelector(':scope > code');
    if (!code) continue;
    const text = selectedTextIn(range, code);
    // a blank line has no text to select, so it counts when the selection covers all of it. A line the
    // selection only touches (e.g. ends at its start) still does not count.
    if (text || (!code.textContent && coversNode(range, code))) selected.push({ line: rowLine, text });
  }

  if (selected.length < 2) return undefined;
  selected.sort((a, b) => a.line - b.line);
  const startLine = selected[0].line;
  const endLine = selected[selected.length - 1].line;
  if (startLine === endLine) return undefined;
  // a selection left over from elsewhere in the diff does not belong to an action on another line.
  if (line !== undefined && (line < startLine || line > endLine)) return undefined;

  const text = selected.map((entry) => entry.text).join('\n');
  if (!text.trim()) return undefined;
  return { startLine, endLine, text };
}

/** whether `range` covers all of `node`'s contents. */
function coversNode(range: Range, node: Node): boolean {
  if (!range.intersectsNode(node)) return false;
  const whole = document.createRange();
  whole.selectNodeContents(node);
  return (
    range.compareBoundaryPoints(Range.START_TO_START, whole) <= 0 &&
    range.compareBoundaryPoints(Range.END_TO_END, whole) >= 0
  );
}

/** the part of `range` that falls inside `node`, as text. Empty when they do not overlap. */
function selectedTextIn(range: Range, node: Node): string {
  if (!range.intersectsNode(node)) return '';
  const part = document.createRange();
  part.selectNodeContents(node);
  if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0)
    part.setStart(range.startContainer, range.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
  return part.toString();
}
