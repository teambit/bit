import React, { useCallback, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import type { DiffLineItem, DiffSection } from './diff-model';
import { computeDiffLines, buildSections, statsFromItems, pairForSplit } from './diff-model';
import type { HlLines, HlToken } from './highlighter';
import { useHighlightedLines, langFromFileName } from './highlighter';
import { resolveTokenColor } from './shiki-bit-theme';
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
  className?: string;
};

const ROW_H = 22;
const VIRTUALIZE_THRESHOLD = 120;
const OVERSCAN = 14;
const EXPAND_CHUNK = 20;

type GapState = { top: number; bottom: number };

/** a single rendered row: a code line (or a left/right pair) or a collapsed-gap expander. */
type RenderRow =
  | { kind: 'unified'; item: DiffLineItem; key: string }
  | { kind: 'split'; left?: DiffLineItem; right?: DiffLineItem; key: string }
  | { kind: 'gap'; id: string; hidden: DiffLineItem[]; state: GapState; key: string };

export function DiffViewer({
  fileName,
  oldContent,
  newContent,
  language,
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
  const [gapStates, setGapStates] = useState<Record<string, GapState>>({});

  const lang = language ?? langFromFileName(fileName);

  const items = useMemo(() => computeDiffLines(oldContent, newContent), [oldContent, newContent]);
  const stats = useMemo(() => statsFromItems(items), [items]);
  const sections = useMemo(() => buildSections(items, contextLines), [items, contextLines]);

  // tokenize each whole file once; multi-line constructs stay correct and lines are looked up by number.
  const oldHl = useHighlightedLines(oldContent, lang);
  const newHl = useHighlightedLines(newContent, lang);

  // a stable horizontal track width so virtualized rows align and the gutters can stay sticky.
  const codeWidthCh = useMemo(() => {
    let max = 0;
    for (const it of items) if (it.text.length > max) max = it.text.length;
    return Math.min(Math.max(max, 40), 400);
  }, [items]);

  const expandGap = useCallback((id: string, hiddenLen: number, dir: 'top' | 'bottom' | 'all') => {
    setGapStates((prev) => {
      const cur = prev[id] ?? { top: 0, bottom: 0 };
      const remaining = hiddenLen - cur.top - cur.bottom;
      if (remaining <= 0) return prev;
      if (dir === 'all') return { ...prev, [id]: { top: cur.top + remaining, bottom: cur.bottom } };
      const add = Math.min(EXPAND_CHUNK, remaining);
      if (dir === 'top') return { ...prev, [id]: { ...cur, top: cur.top + add } };
      return { ...prev, [id]: { ...cur, bottom: cur.bottom + add } };
    });
  }, []);

  const rows = useMemo(() => buildRenderRows(sections, gapStates, view), [sections, gapStates, view]);

  return (
    <div className={classNames(styles.diffViewer, wrap && styles.wrap, className)} data-status={status}>
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
          virtualize={virtualize}
          onExpand={expandGap}
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

const Row = React.memo(function Row({
  row,
  view,
  oldHl,
  newHl,
  onExpand,
}: {
  row: RenderRow;
  view: DiffViewMode;
  oldHl: HlLines | null;
  newHl: HlLines | null;
  onExpand: (id: string, hiddenLen: number, dir: 'top' | 'bottom' | 'all') => void;
}) {
  if (row.kind === 'gap') {
    return <GapRow id={row.id} hidden={row.hidden} state={row.state} view={view} onExpand={onExpand} />;
  }
  if (row.kind === 'unified') {
    return <UnifiedRow item={row.item} oldHl={oldHl} newHl={newHl} />;
  }
  return <SplitRowView left={row.left} right={row.right} oldHl={oldHl} newHl={newHl} />;
});

function DiffBody({
  rows,
  view,
  oldHl,
  newHl,
  codeWidthCh,
  maxHeight,
  virtualize,
  onExpand,
}: {
  rows: RenderRow[];
  view: DiffViewMode;
  oldHl: HlLines | null;
  newHl: HlLines | null;
  codeWidthCh: number;
  maxHeight: number;
  /** when false, the file renders fully expanded with no inner scroll/windowing (page scrolls). */
  virtualize: boolean;
  onExpand: (id: string, hiddenLen: number, dir: 'top' | 'bottom' | 'all') => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef<number | null>(null);

  const total = rows.length;
  const totalHeight = total * ROW_H;
  // only window when virtualization is enabled AND the file is large enough to warrant it.
  const windowing = virtualize && total > VIRTUALIZE_THRESHOLD;

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
    start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
    end = Math.min(total, Math.ceil((scrollTop + viewport) / ROW_H) + OVERSCAN);
  }
  const visible = windowing ? rows.slice(start, end) : rows;
  const offsetY = start * ROW_H;

  const bodyStyle: React.CSSProperties = {
    // no cap when virtualization is off — the file expands and the host page scrolls.
    maxHeight: virtualize ? maxHeight : undefined,
    // a stable horizontal track so every (virtualized) row aligns; gutters stay sticky over it.
    ['--diff-code-width' as any]: `${codeWidthCh}ch`,
    ['--diff-row-h' as any]: `${ROW_H}px`,
  };

  return (
    <div ref={scrollRef} className={styles.body} style={bodyStyle} onScroll={windowing ? onScroll : undefined}>
      <div
        className={classNames(styles.track, view === 'split' && styles.trackSplit)}
        style={windowing ? { height: totalHeight, position: 'relative' } : undefined}
      >
        <div style={windowing ? { transform: `translateY(${offsetY}px)` } : undefined}>
          {visible.map((row) => (
            <Row key={row.key} row={row} view={view} oldHl={oldHl} newHl={newHl} onExpand={onExpand} />
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

function UnifiedRow({ item, oldHl, newHl }: { item: DiffLineItem; oldHl: HlLines | null; newHl: HlLines | null }) {
  const tone = item.type === 'add' ? styles.addLine : item.type === 'del' ? styles.delLine : undefined;
  const sign = item.type === 'add' ? '+' : item.type === 'del' ? '−' : '';
  return (
    <div className={classNames(styles.row, styles.unifiedRow, tone)}>
      <span className={classNames(styles.gutter, styles.gutterNum)}>{item.oldLn ?? ''}</span>
      <span className={classNames(styles.gutter, styles.gutterNum)}>{item.newLn ?? ''}</span>
      <span className={classNames(styles.gutter, styles.sign)}>{sign}</span>
      <code className={styles.code}>{renderLineContent(hlForLine(item, oldHl, newHl), item.text, item.intra)}</code>
    </div>
  );
}

function SplitRowView({
  left,
  right,
  oldHl,
  newHl,
}: {
  left?: DiffLineItem;
  right?: DiffLineItem;
  oldHl: HlLines | null;
  newHl: HlLines | null;
}) {
  return (
    <div className={classNames(styles.row, styles.splitRow)}>
      <SplitCell item={left} side="left" oldHl={oldHl} newHl={newHl} />
      <SplitCell item={right} side="right" oldHl={oldHl} newHl={newHl} />
    </div>
  );
}

function SplitCell({
  item,
  side,
  oldHl,
  newHl,
}: {
  item?: DiffLineItem;
  side: 'left' | 'right';
  oldHl: HlLines | null;
  newHl: HlLines | null;
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
  const num = side === 'left' ? item.oldLn : item.newLn;
  return (
    <div className={classNames(styles.splitCell, tone)}>
      <span className={classNames(styles.gutter, styles.gutterNum)}>{num ?? ''}</span>
      <code className={styles.code}>{renderLineContent(hlForLine(item, oldHl, newHl), item.text, item.intra)}</code>
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
  const out: React.ReactNode[] = [];
  let offset = 0;
  let key = 0;
  for (const seg of base) {
    const segStart = offset;
    const segEnd = offset + seg.text.length;
    let pos = segStart;
    while (pos < segEnd) {
      const boundary = nextBoundary(intra, pos, segEnd);
      const slice = seg.text.slice(pos - segStart, boundary - segStart);
      const changed = isChanged(intra, pos);
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

function isChanged(ranges: Array<[number, number]>, pos: number): boolean {
  return ranges.some(([s, e]) => pos >= s && pos < e);
}

/** the next character offset (≤ limit) at which "changed-ness" flips, so we can slice on boundaries. */
function nextBoundary(ranges: Array<[number, number]>, pos: number, limit: number): number {
  let next = limit;
  for (const [s, e] of ranges) {
    if (s > pos && s < next) next = s;
    if (e > pos && e < next) next = e;
  }
  return next;
}

// --- render-row assembly ---

function buildRenderRows(
  sections: DiffSection[],
  gapStates: Record<string, GapState>,
  view: DiffViewMode
): RenderRow[] {
  const rows: RenderRow[] = [];
  let buffer: DiffLineItem[] = [];
  let keyCounter = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    if (view === 'split') {
      for (const pair of pairForSplit(buffer)) {
        rows.push({ kind: 'split', left: pair.left, right: pair.right, key: `r${keyCounter++}` });
      }
    } else {
      for (const item of buffer) {
        rows.push({ kind: 'unified', item, key: `r${keyCounter++}` });
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
