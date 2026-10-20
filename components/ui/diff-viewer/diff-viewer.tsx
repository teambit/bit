import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import type { DiffLineItem, DiffSection, GapState } from './diff-model';
import { computeDiffLines, buildSections, gapStatesFor, statsFromItems, pairForSplit } from './diff-model';
import type { HlLines, HlToken } from './highlighter';
import { useHighlightedLines } from './highlighter';
import { langFromFileName, normalizeLanguage } from './language';
import { resolveTokenColor } from './shiki-bit-theme';
import type { AnnotationIndex, DiffAnnotation, DiffLineContext, DiffLineSide } from './annotations';
import { EMPTY_ANNOTATION_INDEX, buildAnnotationIndex, captureDiffSelection, lineAttribute, lineKey } from './annotations';
import styles from './diff-viewer.module.scss';

export type DiffViewMode = 'unified' | 'split';
export type DiffFileStatus = 'new' | 'deleted' | 'modified' | 'renamed';

export type DiffViewerProps = {
  /** path shown in the header; also used to infer the language when `language` is omitted. */
  fileName: string;
  /** original (base) file content. */
  oldContent: string;
  /** modified (compare) file content. */
  newContent: string;
  /** language id override (otherwise inferred from the file extension). */
  language?: string;
  /** ignore leading/trailing whitespace while matching lines without altering rendered source. */
  ignoreTrimWhitespace?: boolean;
  /** controlled view mode. */
  view?: DiffViewMode;
  /** initial view mode when uncontrolled. */
  defaultView?: DiffViewMode;
  onViewChange?: (view: DiffViewMode) => void;
  status?: DiffFileStatus;
  /** allow collapsing the whole file body from the header. */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /** unchanged context lines kept around each change before collapsing (default 3). */
  contextLines?: number;
  /** max body height before the diff scrolls + virtualizes internally (default 640). */
  maxHeight?: number;
  /** virtualize + inner-scroll the body past `maxHeight` (default true). Set false to render the
   * file fully expanded with no inner scroll — e.g. when stacking many files under one page scroll. */
  virtualize?: boolean;
  /** render the file header bar (default true). */
  showHeader?: boolean;
  /** show the per-file Unified/Split toggle in the header (default true). Set false when the host
   * provides a single global view-mode control for all files. */
  showViewToggle?: boolean;
  /** soft-wrap long lines instead of scrolling them horizontally (default false). Best for stacked,
   * non-virtualized diffs (e.g. a changes view) where per-line/side scrollbars would be noise. */
  wrap?: boolean;
  /** per-line gutter content, under-line widgets and highlighted ranges supplied by the host. */
  annotations?: DiffAnnotation[];
  /** enables the gutter add-affordance; called with the line acted on and any covering selection. */
  onLineAction?: (context: DiffLineContext, event: React.MouseEvent) => void;
  /** accessible label for the gutter add-affordance (default "Comment on this line"). */
  lineActionLabel?: string;
  className?: string;
};

const ROW_H = 22;
const VIRTUALIZE_THRESHOLD = 120;
const OVERSCAN = 14;
const EXPAND_CHUNK = 20;

const EMPTY_REVEALED: Set<DiffLineItem> = new Set();


/** a single rendered row: a code line (or a left/right pair), a collapsed-gap expander, or a
 * host-supplied full-width block anchored under a line. */
type RenderRow =
  | { kind: 'unified'; item: DiffLineItem; key: string }
  | { kind: 'split'; left?: DiffLineItem; right?: DiffLineItem; key: string }
  | { kind: 'gap'; id: string; hidden: DiffLineItem[]; state: GapState; key: string }
  | { kind: 'widget'; nodes: React.ReactNode[]; key: string };

export function DiffViewer({
  fileName,
  oldContent,
  newContent,
  language,
  ignoreTrimWhitespace = false,
  view: controlledView,
  defaultView = 'split',
  onViewChange,
  status = 'modified',
  collapsible = true,
  defaultCollapsed = false,
  contextLines = 3,
  maxHeight = 640,
  virtualize = true,
  showHeader = true,
  showViewToggle = true,
  wrap = false,
  annotations,
  onLineAction,
  lineActionLabel = 'Comment on this line',
  className,
}: DiffViewerProps) {
  const [uncontrolledView, setUncontrolledView] = useState<DiffViewMode>(defaultView);
  const view = controlledView ?? uncontrolledView;
  const setView = useCallback(
    (next: DiffViewMode) => {
      if (controlledView === undefined) setUncontrolledView(next);
      onViewChange?.(next);
    },
    [controlledView, onViewChange]
  );

  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const lang = normalizeLanguage(language) ?? langFromFileName(fileName);

  const items = useMemo(
    () => computeDiffLines(oldContent, newContent, { ignoreTrimWhitespace }),
    [oldContent, newContent, ignoreTrimWhitespace]
  );
  const stats = useMemo(() => statsFromItems(items), [items]);
  const annotationIndex = useMemo(() => buildAnnotationIndex(annotations), [annotations]);
  // Annotated lines stay visible when unchanged code collapses, so a comment is never hidden in a gap.
  // Keyed by the set of anchored lines, not the annotations array: a host that re-creates the array
  // with the same lines must not rebuild the sections, which would reset the expanded gaps.
  const anchorsKey = useMemo(() => [...annotationIndex.anchored].sort().join(','), [annotationIndex]);
  const sections = useMemo(() => {
    if (!anchorsKey) return buildSections(items, contextLines);
    const anchored = new Set(anchorsKey.split(','));
    return buildSections(
      items,
      contextLines,
      (item) =>
        (!!item.oldLn && anchored.has(lineKey('old', item.oldLn))) ||
        (!!item.newLn && anchored.has(lineKey('new', item.newLn)))
    );
  }, [items, contextLines, anchorsKey]);
  // Expanded gaps are remembered as the lines they revealed, not per gap: gap ids are positional and
  // change whenever the sections are rebuilt (e.g. a new comment adds an anchor), which would otherwise
  // collapse every gap the reader opened. New file contents start collapsed again.
  const [revealStore, setRevealStore] = useState<{ items?: DiffLineItem[]; revealed: Set<DiffLineItem> }>({
    revealed: new Set(),
  });
  const revealed = revealStore.items === items ? revealStore.revealed : EMPTY_REVEALED;
  const gapStates = useMemo(() => gapStatesFor(sections, revealed), [sections, revealed]);

  // tokenize each whole file once; multi-line constructs stay correct and lines are looked up by number.
  const oldHl = useHighlightedLines(oldContent, lang);
  const newHl = useHighlightedLines(newContent, lang);

  // a stable horizontal track width so virtualized rows align and the gutters can stay sticky.
  const codeWidthCh = useMemo(() => {
    let max = 0;
    for (const it of items) if (it.text.length > max) max = it.text.length;
    return Math.max(max, 40);
  }, [items]);

  const expandGap = useCallback(
    (id: string, _hiddenLen: number, dir: 'top' | 'bottom' | 'all') => {
      const gap = sections.find((section) => section.kind === 'gap' && section.id === id);
      if (!gap || gap.kind !== 'gap') return;
      setRevealStore((prev) => {
        const current = prev.items === items ? prev.revealed : EMPTY_REVEALED;
        const { top, bottom } = gapStatesFor([gap], current)[id] ?? { top: 0, bottom: 0 };
        const remaining = gap.hidden.length - top - bottom;
        if (remaining <= 0) return prev;
        let from = top;
        let to = gap.hidden.length - bottom;
        if (dir === 'top') to = top + Math.min(EXPAND_CHUNK, remaining);
        if (dir === 'bottom') from = to - Math.min(EXPAND_CHUNK, remaining);
        const next = new Set(current);
        for (let i = from; i < to; i++) next.add(gap.hidden[i]);
        return { items, revealed: next };
      });
    },
    [sections, items]
  );

  const rows = useMemo(
    () => buildRenderRows(sections, gapStates, view, annotationIndex),
    [sections, gapStates, view, annotationIndex]
  );

  const rootRef = useRef<HTMLDivElement>(null);

  // Resolve the acted-on line into a host-facing context, attaching the covering text selection (if
  // any) before the click collapses it.
  const emitLineAction = useCallback(
    (side: DiffLineSide, line: number, text: string, event: React.MouseEvent) => {
      if (!onLineAction) return;
      const selection = captureDiffSelection(side, rootRef.current, line);
      onLineAction({ fileName, side, line, text, selection }, event);
    },
    [onLineAction, fileName]
  );

  return (
    <div
      ref={rootRef}
      className={classNames(styles.diffViewer, wrap && styles.wrap, className)}
      data-status={status}
    >
      {showHeader && (
        <DiffHeader
          fileName={fileName}
          status={status}
          additions={stats.additions}
          deletions={stats.deletions}
          view={view}
          onViewChange={setView}
          showViewToggle={showViewToggle}
          collapsible={collapsible}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
      )}
      {!collapsed && (
        <DiffBody
          rows={rows}
          view={view}
          oldHl={oldHl}
          newHl={newHl}
          codeWidthCh={codeWidthCh}
          maxHeight={maxHeight}
          // Wrap and under-line widgets both make rows variable-height, which invalidates fixed-row
          // windowing. Render all rows but retain the requested scroll cap through constrainHeight.
          virtualize={virtualize && !wrap && !annotationIndex.hasWidgets}
          constrainHeight={virtualize}
          onExpand={expandGap}
          annotationIndex={annotationIndex}
          onLineAction={onLineAction ? emitLineAction : undefined}
          lineActionLabel={lineActionLabel}
        />
      )}
    </div>
  );
}

// --- Header ---

function DiffHeader({
  fileName,
  status,
  additions,
  deletions,
  view,
  onViewChange,
  showViewToggle,
  collapsible,
  collapsed,
  onToggleCollapse,
}: {
  fileName: string;
  status: DiffFileStatus;
  additions: number;
  deletions: number;
  view: DiffViewMode;
  onViewChange: (v: DiffViewMode) => void;
  showViewToggle: boolean;
  collapsible: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const statusLabel = status[0].toUpperCase() + status.slice(1);
  return (
    <div className={styles.header}>
      {collapsible && (
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand file' : 'Collapse file'}
        >
          <Chevron open={!collapsed} />
        </button>
      )}
      <span className={styles.fileName}>{fileName}</span>
      <span className={classNames(styles.statusChip, styles[`status_${status}`])}>{statusLabel}</span>
      <div className={styles.stats}>
        {additions > 0 && <span className={styles.add}>+{additions}</span>}
        {deletions > 0 && <span className={styles.del}>−{deletions}</span>}
        <ChangeBar additions={additions} deletions={deletions} />
      </div>
      {showViewToggle && (
        <div className={styles.viewToggle} role="group" aria-label="Diff view mode">
          <button
            type="button"
            className={classNames(styles.toggleBtn, view === 'unified' && styles.toggleActive)}
            onClick={() => onViewChange('unified')}
          >
            Unified
          </button>
          <button
            type="button"
            className={classNames(styles.toggleBtn, view === 'split' && styles.toggleActive)}
            onClick={() => onViewChange('split')}
          >
            Split
          </button>
        </div>
      )}
    </div>
  );
}

// --- Body + virtualization ---

/** reports a gutter action back to DiffViewer, which enriches it with the covering text selection. */
type LineActionEmitter = (side: DiffLineSide, line: number, text: string, event: React.MouseEvent) => void;

type RowDecoration = {
  annotationIndex: AnnotationIndex;
  onLineAction?: LineActionEmitter;
  lineActionLabel: string;
};

const Row = React.memo(function Row({
  row,
  view,
  oldHl,
  newHl,
  onExpand,
  decoration,
}: {
  row: RenderRow;
  view: DiffViewMode;
  oldHl: HlLines | null;
  newHl: HlLines | null;
  onExpand: (id: string, hiddenLen: number, dir: 'top' | 'bottom' | 'all') => void;
  decoration: RowDecoration;
}) {
  if (row.kind === 'gap') {
    return <GapRow id={row.id} hidden={row.hidden} state={row.state} view={view} onExpand={onExpand} />;
  }
  if (row.kind === 'widget') {
    return <WidgetRow nodes={row.nodes} />;
  }
  if (row.kind === 'unified') {
    return <UnifiedRow item={row.item} oldHl={oldHl} newHl={newHl} decoration={decoration} />;
  }
  return <SplitRowView left={row.left} right={row.right} oldHl={oldHl} newHl={newHl} decoration={decoration} />;
});

function DiffBody({
  rows,
  view,
  oldHl,
  newHl,
  codeWidthCh,
  maxHeight,
  virtualize,
  constrainHeight,
  onExpand,
  annotationIndex,
  onLineAction,
  lineActionLabel,
}: {
  rows: RenderRow[];
  view: DiffViewMode;
  oldHl: HlLines | null;
  newHl: HlLines | null;
  codeWidthCh: number;
  maxHeight: number;
  /** when false, the file renders fully expanded with no inner scroll/windowing (page scrolls). */
  virtualize: boolean;
  /** keep the body bounded even when wrapping disables fixed-row virtualization. */
  constrainHeight: boolean;
  onExpand: (id: string, hiddenLen: number, dir: 'top' | 'bottom' | 'all') => void;
  annotationIndex: AnnotationIndex;
  onLineAction?: LineActionEmitter;
  lineActionLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef<number | null>(null);
  const previousViewRef = useRef(view);

  const total = rows.length;
  const totalHeight = total * ROW_H;
  // only window when virtualization is enabled AND the file is large enough to warrant it.
  const windowing = virtualize && total > VIRTUALIZE_THRESHOLD;
  const maxScrollTop = windowing ? Math.max(0, totalHeight - maxHeight) : 0;
  // Clamp during render as well as synchronizing state below. This prevents even one paint from
  // slicing beyond the new row model when a split/unified switch reduces the number of rows.
  const effectiveScrollTop = Math.min(scrollTop, maxScrollTop);

  useEffect(() => {
    const viewChanged = previousViewRef.current !== view;
    previousViewRef.current = view;
    // Without windowing the browser owns the scroll position, and `maxScrollTop` is 0. Clamping to it
    // would jump the pane to the top, e.g. when a widget turns windowing off while scrolled down.
    if (!windowing && !viewChanged) return;
    setScrollTop((current) => {
      const next = viewChanged ? 0 : Math.min(current, maxScrollTop);
      if (scrollRef.current && scrollRef.current.scrollTop !== next) scrollRef.current.scrollTop = next;
      return current === next ? current : next;
    });
  }, [view, maxScrollTop, windowing]);

  // cancel a pending scroll RAF on unmount — DiffBody is conditionally mounted (collapse hides it),
  // so a queued frame could otherwise fire setScrollTop() after unmount.
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const onScroll = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
    });
  }, []);

  let start = 0;
  let end = total;
  if (windowing) {
    const viewport = maxHeight;
    start = Math.max(0, Math.floor(effectiveScrollTop / ROW_H) - OVERSCAN);
    end = Math.min(total, Math.ceil((effectiveScrollTop + viewport) / ROW_H) + OVERSCAN);
  }
  const visible = windowing ? rows.slice(start, end) : rows;
  const offsetY = start * ROW_H;

  const decoration = useMemo<RowDecoration>(
    () => ({ annotationIndex, onLineAction, lineActionLabel }),
    [annotationIndex, onLineAction, lineActionLabel]
  );

  const bodyStyle: React.CSSProperties = {
    // Wrapped rows cannot use fixed-height virtualization, but still need the caller's scroll cap.
    maxHeight: constrainHeight ? maxHeight : undefined,
    // a stable horizontal track so every (virtualized) row aligns; gutters stay sticky over it.
    ['--diff-code-width' as any]: `${codeWidthCh}ch`,
    ['--diff-row-h' as any]: `${ROW_H}px`,
  };

  return (
    <div ref={scrollRef} className={styles.body} style={bodyStyle} onScroll={constrainHeight ? onScroll : undefined}>
      <div
        className={classNames(styles.track, view === 'split' && styles.trackSplit)}
        style={windowing ? { height: totalHeight, position: 'relative' } : undefined}
      >
        <div style={windowing ? { transform: `translateY(${offsetY}px)` } : undefined}>
          {visible.map((row) => (
            <Row
              key={row.key}
              row={row}
              view={view}
              oldHl={oldHl}
              newHl={newHl}
              onExpand={onExpand}
              decoration={decoration}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function hlForLine(item: DiffLineItem, oldHl: HlLines | null, newHl: HlLines | null): HlToken[] | null {
  if (item.type === 'del') return item.oldLn ? (oldHl?.[item.oldLn - 1] ?? null) : null;
  return item.newLn ? (newHl?.[item.newLn - 1] ?? null) : null;
}

/**
 * A line-number gutter cell. Beyond the number it hosts the host's annotation content (e.g. a
 * commenter avatar) and, on hover, the add-affordance that reports a line action.
 */
function LineGutter({
  side,
  line,
  text,
  decoration,
  allowAction = true,
}: {
  side: DiffLineSide;
  line?: number;
  text: string;
  decoration: RowDecoration;
  /** false to show only the number and annotations, e.g. the old gutter of a unified context line. */
  allowAction?: boolean;
}) {
  const { annotationIndex, onLineAction, lineActionLabel } = decoration;
  const nodes = line ? annotationIndex.gutter.get(lineKey(side, line)) : undefined;
  // The annotation and the add-affordance share the gutter's one free slot; an annotated line keeps
  // its badge (which stays clickable) rather than swapping it for a "+" on hover.
  const actionable = allowAction && !!onLineAction && !!line && !nodes;

  return (
    <span className={classNames(styles.gutter, styles.gutterNum)}>
      {nodes && (
        <span className={styles.gutterAnnotation}>
          {nodes.map((node, i) => (
            <React.Fragment key={i}>{node}</React.Fragment>
          ))}
        </span>
      )}
      {actionable && (
        <button
          type="button"
          className={styles.lineAction}
          aria-label={lineActionLabel}
          title={lineActionLabel}
          onClick={(event) => onLineAction?.(side, line, text, event)}
        >
          +
        </button>
      )}
      {line ?? ''}
    </span>
  );
}

/** range/active tints for a row, derived from whichever of its sides the host annotated. */
function toneFor(index: AnnotationIndex, sides: Array<[DiffLineSide, number | undefined]>) {
  let inRange = false;
  let active = false;
  for (const [side, line] of sides) {
    if (!line) continue;
    const key = lineKey(side, line);
    if (index.range.has(key)) inRange = true;
    if (index.active.has(key)) active = true;
  }
  return classNames(inRange && styles.rangeLine, active && styles.activeLine);
}

function UnifiedRow({
  item,
  oldHl,
  newHl,
  decoration,
}: {
  item: DiffLineItem;
  oldHl: HlLines | null;
  newHl: HlLines | null;
  decoration: RowDecoration;
}) {
  const tone = item.type === 'add' ? styles.addLine : item.type === 'del' ? styles.delLine : undefined;
  const sign = item.type === 'add' ? '+' : item.type === 'del' ? '−' : '';
  const annotated = toneFor(decoration.annotationIndex, [
    ['old', item.oldLn],
    ['new', item.newLn],
  ]);
  return (
    <div
      className={classNames(styles.row, styles.unifiedRow, tone, annotated)}
      // carried on the row (not the gutter) so a selection dragged through the code column still
      // resolves its first and last lines — see captureDiffSelection.
      {...{ [lineAttribute('old')]: item.oldLn, [lineAttribute('new')]: item.newLn }}
    >
      {/* one add-affordance per unified line: the old side only for a removed line, the new side
          otherwise. An unchanged line has both numbers, and two buttons would anchor to different sides. */}
      <LineGutter
        side="old"
        line={item.oldLn}
        text={item.oldText ?? item.text}
        decoration={decoration}
        allowAction={item.type === 'del'}
      />
      <LineGutter
        side="new"
        line={item.newLn}
        text={item.newText ?? item.text}
        decoration={decoration}
        allowAction={item.type !== 'del'}
      />
      <span className={classNames(styles.gutter, styles.sign)}>{sign}</span>
      <code className={styles.code}>
        {renderLineContent(hlForLine(item, oldHl, newHl), item.newText ?? item.text, item.intra)}
      </code>
    </div>
  );
}

/** a host-supplied block spanning the full row width, anchored beneath its line. */
function WidgetRow({ nodes }: { nodes: React.ReactNode[] }) {
  return (
    <div className={styles.widgetRow}>
      {nodes.map((node, i) => (
        <React.Fragment key={i}>{node}</React.Fragment>
      ))}
    </div>
  );
}

function SplitRowView({
  left,
  right,
  oldHl,
  newHl,
  decoration,
}: {
  left?: DiffLineItem;
  right?: DiffLineItem;
  oldHl: HlLines | null;
  newHl: HlLines | null;
  decoration: RowDecoration;
}) {
  return (
    <div className={classNames(styles.row, styles.splitRow)}>
      <SplitCell item={left} side="left" oldHl={oldHl} newHl={newHl} decoration={decoration} />
      <SplitCell item={right} side="right" oldHl={oldHl} newHl={newHl} decoration={decoration} />
    </div>
  );
}

function SplitCell({
  item,
  side,
  oldHl,
  newHl,
  decoration,
}: {
  item?: DiffLineItem;
  side: 'left' | 'right';
  oldHl: HlLines | null;
  newHl: HlLines | null;
  decoration: RowDecoration;
}) {
  if (!item) {
    return (
      <div className={classNames(styles.splitCell, styles.emptyCell)}>
        <span className={classNames(styles.gutter, styles.gutterNum)} />
        <code className={styles.code} />
      </div>
    );
  }
  const tone = item.type === 'add' ? styles.addLine : item.type === 'del' ? styles.delLine : undefined;
  const diffSide: DiffLineSide = side === 'left' ? 'old' : 'new';
  const num = side === 'left' ? item.oldLn : item.newLn;
  const text = side === 'left' ? (item.oldText ?? item.text) : (item.newText ?? item.text);
  const highlighted =
    side === 'left'
      ? item.oldLn
        ? (oldHl?.[item.oldLn - 1] ?? null)
        : null
      : item.newLn
        ? (newHl?.[item.newLn - 1] ?? null)
        : null;
  const annotated = toneFor(decoration.annotationIndex, [[diffSide, num]]);
  return (
    <div
      className={classNames(styles.splitCell, tone, annotated)}
      // the cell, not the gutter — see captureDiffSelection.
      {...(num ? { [lineAttribute(diffSide)]: num } : {})}
    >
      <LineGutter side={diffSide} line={num} text={text} decoration={decoration} />
      <code className={styles.code}>{renderLineContent(highlighted, text, item.intra)}</code>
    </div>
  );
}

function GapRow({
  id,
  hidden,
  state,
  view,
  onExpand,
}: {
  id: string;
  hidden: DiffLineItem[];
  state: GapState;
  view: DiffViewMode;
  onExpand: (id: string, hiddenLen: number, dir: 'top' | 'bottom' | 'all') => void;
}) {
  const remaining = hidden.length - state.top - state.bottom;
  const canChunk = remaining > EXPAND_CHUNK;
  return (
    <div className={classNames(styles.row, styles.gapRow)} data-view={view}>
      <span className={styles.gapControls}>
        {canChunk && (
          <button
            type="button"
            className={styles.gapBtn}
            title="Expand up"
            onClick={() => onExpand(id, hidden.length, 'top')}
          >
            <ExpandUp />
          </button>
        )}
        {canChunk && (
          <button
            type="button"
            className={styles.gapBtn}
            title="Expand down"
            onClick={() => onExpand(id, hidden.length, 'bottom')}
          >
            <ExpandDown />
          </button>
        )}
      </span>
      <button type="button" className={styles.gapLabel} onClick={() => onExpand(id, hidden.length, 'all')}>
        {expandLabel(remaining)}
      </button>
    </div>
  );
}

function expandLabel(remaining: number): string {
  if (remaining <= 0) return 'Expanded';
  return `Expand ${remaining} unchanged ${remaining === 1 ? 'line' : 'lines'}`;
}

// --- token + intra-line rendering ---

type Segment = { text: string; color?: string };

/**
 * Render a code line: syntax tokens get their Bit color, and the half-open `intra` ranges (the
 * characters that actually changed) are wrapped in `<mark>` — overlaid on top of the syntax tokens so
 * a one-character edit reads clearly without losing highlighting.
 */
function renderLineContent(tokens: HlToken[] | null, text: string, intra?: Array<[number, number]>) {
  const base: Segment[] = tokens
    ? tokens.map((t) => ({ text: t.content, color: resolveTokenColor(t.color) }))
    : [{ text }];

  if (!intra || intra.length === 0) {
    return base.map((seg, i) =>
      seg.color ? (
        <span key={i} style={{ color: seg.color }}>
          {seg.text}
        </span>
      ) : (
        <span key={i}>{seg.text}</span>
      )
    );
  }

  // overlay intra-line change ranges by splitting each syntax segment at range boundaries.
  // `intra` ranges are produced sorted and non-overlapping, and `pos` advances monotonically across the
  // whole line, so a single advancing pointer (`ri`) over the ranges makes this O(slices + ranges)
  // instead of re-scanning every range for each emitted slice.
  const out: React.ReactNode[] = [];
  let offset = 0;
  let key = 0;
  let ri = 0;
  for (const seg of base) {
    const segStart = offset;
    const segEnd = offset + seg.text.length;
    let pos = segStart;
    while (pos < segEnd) {
      // drop ranges that already ended at/before `pos`; the first survivor (if any) is the next relevant one.
      while (ri < intra.length && intra[ri][1] <= pos) ri += 1;
      const range = ri < intra.length ? intra[ri] : undefined;
      const changed = !!range && pos >= range[0] && pos < range[1];
      // next offset at which changed-ness flips, clamped to this segment's end.
      const boundary = changed ? Math.min(range[1], segEnd) : Math.min(range ? range[0] : segEnd, segEnd);
      const slice = seg.text.slice(pos - segStart, boundary - segStart);
      const style = seg.color ? { color: seg.color } : undefined;
      out.push(
        changed ? (
          <mark key={key++} className={styles.intra} style={style}>
            {slice}
          </mark>
        ) : (
          <span key={key++} style={style}>
            {slice}
          </span>
        )
      );
      pos = boundary;
    }
    offset = segEnd;
  }
  return out;
}

// --- render-row assembly ---

/** collect the host's under-line blocks for whichever sides this row covers, in old-then-new order. */
function widgetsFor(
  index: AnnotationIndex,
  sides: Array<[DiffLineSide, number | undefined]>
): React.ReactNode[] | undefined {
  if (!index.hasWidgets) return undefined;
  let out: React.ReactNode[] | undefined;
  for (const [side, line] of sides) {
    if (!line) continue;
    const nodes = index.widget.get(lineKey(side, line));
    if (!nodes) continue;
    if (out) out.push(...nodes);
    else out = [...nodes];
  }
  return out;
}

function buildRenderRows(
  sections: DiffSection[],
  gapStates: Record<string, GapState>,
  view: DiffViewMode,
  annotationIndex: AnnotationIndex = EMPTY_ANNOTATION_INDEX
): RenderRow[] {
  const rows: RenderRow[] = [];
  let buffer: DiffLineItem[] = [];

  // keys are derived from the row's underlying line numbers (unique across the file), not a rebuild
  // counter, so they stay stable when `view` toggles or a gap expands — otherwise every row's key would
  // change on each buildRenderRows() call, forcing React to remount all rows and defeating windowing.
  const flush = () => {
    if (buffer.length === 0) return;
    if (view === 'split') {
      for (const pair of pairForSplit(buffer)) {
        const key = `s:${pair.left?.oldLn ?? 'x'}:${pair.right?.newLn ?? 'x'}`;
        rows.push({ kind: 'split', left: pair.left, right: pair.right, key });
        const widgets = widgetsFor(annotationIndex, [
          ['old', pair.left?.oldLn],
          ['new', pair.right?.newLn],
        ]);
        if (widgets) rows.push({ kind: 'widget', nodes: widgets, key: `w:${key}` });
      }
    } else {
      for (const item of buffer) {
        const key = `u:${item.oldLn ?? 'x'}:${item.newLn ?? 'x'}:${item.type}`;
        rows.push({ kind: 'unified', item, key });
        const widgets = widgetsFor(annotationIndex, [
          ['old', item.oldLn],
          ['new', item.newLn],
        ]);
        if (widgets) rows.push({ kind: 'widget', nodes: widgets, key: `w:${key}` });
      }
    }
    buffer = [];
  };

  for (const section of sections) {
    if (section.kind === 'lines') {
      buffer.push(...section.items);
      continue;
    }
    // gap: reveal lines from each end per expansion state, with an expander for the remainder.
    const state = gapStates[section.id] ?? { top: 0, bottom: 0 };
    const top = section.hidden.slice(0, state.top);
    const bottom = state.bottom > 0 ? section.hidden.slice(section.hidden.length - state.bottom) : [];
    const remaining = section.hidden.length - state.top - state.bottom;
    buffer.push(...top);
    if (remaining > 0) {
      flush();
      rows.push({ kind: 'gap', id: section.id, hidden: section.hidden, state, key: `g${section.id}` });
    }
    buffer.push(...bottom);
  }
  flush();
  return rows;
}

// --- small bits ---

function ChangeBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions;
  if (total === 0) return null;
  const max = 5;
  const a = Math.round((additions / total) * max);
  const d = Math.max(0, Math.min(max - a, Math.round((deletions / total) * max)));
  const e = Math.max(0, max - a - d);
  return (
    <span className={styles.changeBar}>
      {Array.from({ length: a }).map((_, i) => (
        <span key={`a${i}`} className={styles.barAdd} />
      ))}
      {Array.from({ length: d }).map((_, i) => (
        <span key={`d${i}`} className={styles.barDel} />
      ))}
      {Array.from({ length: e }).map((_, i) => (
        <span key={`e${i}`} className={styles.barNeutral} />
      ))}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" className={classNames(styles.chevron, open && styles.chevronOpen)}>
      <path
        d="M4 2.5L7.5 6L4 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExpandUp() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path
        d="M3 7L6 4L9 7"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExpandDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path
        d="M3 5L6 8L9 5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
