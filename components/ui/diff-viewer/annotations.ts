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
  /** the line each annotation is anchored to. These lines stay visible when unchanged code collapses. */
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
    const side = annotation.side ?? 'new';
    const key = lineKey(side, annotation.line);
    index.anchored.add(key);

    if (annotation.gutter) push(index.gutter, key, annotation.gutter);
    if (annotation.widget) {
      push(index.widget, key, annotation.widget);
      index.hasWidgets = true;
    }

    const from = annotation.range?.start ?? annotation.line;
    const to = annotation.range?.end ?? annotation.line;
    // a range is only meaningful when it spans more than the anchor line itself.
    if (annotation.range) {
      for (let line = from; line <= to; line++) index.range.add(lineKey(side, line));
    }
    if (annotation.active) {
      for (let line = from; line <= to; line++) index.active.add(lineKey(side, line));
    }
  }

  return index;
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
 * first/last line numbers on `side`.
 *
 * The line number is read off the whole row (unified) or side cell (split) rather than the gutter:
 * a selection dragged through the code column starts and ends *inside* a code cell, so the first and
 * last rows' gutters fall outside the range entirely and those lines would be missed. The row
 * element, by contrast, is partially contained — which is what `containsNode(node, true)` reports.
 *
 * Returns undefined when there is no selection, it stays within one line, it does not cover `line`
 * (when given), or there is no window (SSR).
 */
export function captureDiffSelection(
  side: DiffLineSide,
  root?: Element | null,
  line?: number
): DiffLineSelection | undefined {
  if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return undefined;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return undefined;

  const text = selection.toString();
  if (!text.trim()) return undefined;

  const scope = root ?? (typeof document !== 'undefined' ? document.body : null);
  if (!scope) return undefined;

  const attribute = lineAttribute(side);
  const rows = scope.querySelectorAll(`[${attribute}]`);
  let startLine: number | undefined;
  let endLine: number | undefined;

  for (const row of Array.from(rows)) {
    if (!selection.containsNode(row, true)) continue;
    const rowLine = Number(row.getAttribute(attribute));
    if (!Number.isFinite(rowLine) || rowLine <= 0) continue;
    if (startLine === undefined || rowLine < startLine) startLine = rowLine;
    if (endLine === undefined || rowLine > endLine) endLine = rowLine;
  }

  if (startLine === undefined || endLine === undefined || startLine === endLine) return undefined;
  // a selection left over from elsewhere in the diff does not belong to an action on another line.
  if (line !== undefined && (line < startLine || line > endLine)) return undefined;
  return { startLine, endLine, text };
}
