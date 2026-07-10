import React from 'react';
import { structuredPatch } from 'diff';
import styles from './inline-diff-viewer.module.scss';

// --- Types ---

export type DiffLine = {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
};

export type DiffHunk = {
  header: string;
  lines: DiffLine[];
};

export type LineFeedback = {
  id: string;
  lineNumber: number;
  isRange: boolean;
  startLine?: number;
  endLine?: number;
  user?: { displayName?: string; username?: string; image?: string };
  message?: string;
};

export type DiffDisplayMode = 'split' | 'unified';

export type DiffFileRendererProps = {
  fileName: string;
  hunks: DiffHunk[];
  status?: string;
  diffMode?: DiffDisplayMode;
  additions?: number;
  deletions?: number;
  feedbacksByLine?: Map<number, LineFeedback[]>;
  rangeLines?: Set<number>;
  highlightedFeedbackId?: string;
  selectedLine?: number;
  dataFileId?: string;
};

// --- Pure Rendering Components (no hooks, no state, just props → JSX) ---

export const DiffFileRenderer = React.memo(function DiffFileRenderer({
  fileName,
  hunks,
  status,
  diffMode = 'split',
  additions = 0,
  deletions = 0,
  feedbacksByLine,
  rangeLines,
  highlightedFeedbackId,
  selectedLine,
  dataFileId,
}: DiffFileRendererProps) {
  return (
    <div className={styles.diffFile} data-file-id={dataFileId}>
      <DiffFileHeader fileName={fileName} status={status} additions={additions} deletions={deletions} />
      <div className={styles.diffTableWrapper}>
        {diffMode === 'split' ? (
          <SplitDiffTable
            hunks={hunks}
            feedbacksByLine={feedbacksByLine}
            rangeLines={rangeLines}
            highlightedFeedbackId={highlightedFeedbackId}
            selectedLine={selectedLine}
          />
        ) : (
          <UnifiedDiffTable
            hunks={hunks}
            feedbacksByLine={feedbacksByLine}
            rangeLines={rangeLines}
            highlightedFeedbackId={highlightedFeedbackId}
            selectedLine={selectedLine}
          />
        )}
      </div>
    </div>
  );
});

export function DiffFileHeader({
  fileName,
  status,
  additions = 0,
  deletions = 0,
}: {
  fileName: string;
  status?: string;
  additions?: number;
  deletions?: number;
}) {
  const statusClass =
    status === 'NEW'
      ? styles.fileStatusNew
      : status === 'DELETED'
        ? styles.fileStatusDeleted
        : styles.fileStatusModified;
  const statusLabel = status === 'NEW' ? 'New' : status === 'DELETED' ? 'Deleted' : 'Modified';
  return (
    <div className={styles.diffFileHeader}>
      <span className={styles.diffFileName}>{fileName}</span>
      {status && status !== 'UNCHANGED' && <span className={statusClass}>{statusLabel}</span>}
      <div className={styles.diffFileStats}>
        {additions > 0 && <span className={styles.diffAdditions}>+{additions}</span>}
        {deletions > 0 && <span className={styles.diffDeletions}>-{deletions}</span>}
        <ChangeBar additions={additions} deletions={deletions} />
      </div>
    </div>
  );
}

// --- Syntax Highlighting (pure) ---

type Token = { type: string; value: string };

const kw = new Set([
  'import',
  'export',
  'from',
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'new',
  'delete',
  'typeof',
  'instanceof',
  'in',
  'of',
  'class',
  'extends',
  'super',
  'this',
  'try',
  'catch',
  'finally',
  'throw',
  'async',
  'await',
  'yield',
  'default',
  'type',
  'interface',
  'enum',
  'as',
  'implements',
  'abstract',
  'readonly',
  'private',
  'protected',
  'public',
  'static',
  'void',
  'null',
  'undefined',
  'true',
  'false',
]);

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < code.length) {
    if (code[i] === '/' && code[i + 1] === '/') {
      const start = i;
      while (i < code.length && code[i] !== '\n') i++;
      tokens.push({ type: 'comment', value: code.slice(start, i) });
      continue;
    }
    if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const q = code[i];
      let j = i + 1;
      while (j < code.length && code[j] !== q) {
        if (code[j] === '\\') j++;
        j++;
      }
      tokens.push({ type: 'string', value: code.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(code[i]) && (i === 0 || /[\s(,=+\-*/<>!&|^~%?:;[\]{}]/.test(code[i - 1]))) {
      const start = i;
      while (i < code.length && /[0-9.xXa-fA-FeEnN_]/.test(code[i])) i++;
      tokens.push({ type: 'number', value: code.slice(start, i) });
      continue;
    }
    if (/[a-zA-Z_$]/.test(code[i])) {
      const start = i;
      while (i < code.length && /[a-zA-Z0-9_$]/.test(code[i])) i++;
      const word = code.slice(start, i);
      tokens.push({ type: kw.has(word) ? 'keyword' : /^[A-Z]/.test(word) ? 'component' : 'identifier', value: word });
      continue;
    }
    if (/[+\-*/%=<>!&|^~?:]/.test(code[i])) {
      tokens.push({ type: 'operator', value: code[i] });
      i++;
      continue;
    }
    if (/[(){}[\]]/.test(code[i])) {
      tokens.push({ type: 'bracket', value: code[i] });
      i++;
      continue;
    }
    tokens.push({ type: 'plain', value: code[i] });
    i++;
  }
  return tokens;
}

const colorMap: Record<string, string> = {
  comment: 'var(--syntax-comment)',
  string: 'var(--syntax-string)',
  number: 'var(--syntax-number)',
  keyword: 'var(--syntax-keyword)',
  component: 'var(--syntax-component)',
  operator: 'var(--syntax-operator)',
  bracket: 'var(--syntax-bracket)',
};

export const HighlightedCode = React.memo(function HighlightedCode({ code }: { code: string }) {
  const tokens = tokenize(code);
  return (
    <code>
      {tokens.map((t, i) => {
        const color = colorMap[t.type];
        return color ? (
          <span key={i} style={{ color }}>
            {t.value}
          </span>
        ) : (
          <span key={i}>{t.value}</span>
        );
      })}
    </code>
  );
});

// --- Split Diff Table ---

type SplitRow = { left?: DiffLine; right?: DiffLine };

function buildSplitRows(hunks: DiffHunk[]): { rows: SplitRow[]; hunkHeaders: Map<number, string> } {
  const rows: SplitRow[] = [];
  const hunkHeaders = new Map<number, string>();
  for (const hunk of hunks) {
    hunkHeaders.set(rows.length, hunk.header);
    let removed: DiffLine[] = [];
    let added: DiffLine[] = [];
    // pair the pending removed/added runs positionally by index, then reset. indexed reads are O(1),
    // whereas draining with Array.shift() (O(n)) made this O(n²) — the pathological case is a single
    // large hunk of all-added/all-removed lines (new or deleted whole files). `arr[i]` past the end is
    // `undefined`, matching the old `shift()` semantics for the shorter side.
    const flush = () => {
      const max = Math.max(removed.length, added.length);
      for (let i = 0; i < max; i += 1) rows.push({ left: removed[i], right: added[i] });
      removed = [];
      added = [];
    };
    for (const line of hunk.lines) {
      if (line.type === 'removed') {
        removed.push(line);
      } else if (line.type === 'added') {
        added.push(line);
      } else {
        flush();
        rows.push({ left: line, right: line });
      }
    }
    flush();
  }
  return { rows, hunkHeaders };
}

function SplitDiffTable({
  hunks,
  feedbacksByLine,
  rangeLines,
  highlightedFeedbackId,
  selectedLine,
}: {
  hunks: DiffHunk[];
  feedbacksByLine?: Map<number, LineFeedback[]>;
  rangeLines?: Set<number>;
  highlightedFeedbackId?: string;
  selectedLine?: number;
}) {
  const { rows } = buildSplitRows(hunks);
  if (hunks.length === 0) {
    return (
      <table className={styles.diffTable}>
        <tbody>
          <tr>
            <td colSpan={5} className={styles.diffEmptyMessage}>
              File changed but diff content not available
            </td>
          </tr>
        </tbody>
      </table>
    );
  }
  return (
    <table className={`${styles.diffTable} ${styles.splitTable}`}>
      <tbody>
        {rows.map((row, idx) => {
          const rightLineNum = row.right?.newLineNumber;
          const leftLineNum = row.left?.oldLineNumber;
          const feedbackLineNum = rightLineNum || leftLineNum;
          const lineFbs = feedbackLineNum ? feedbacksByLine?.get(feedbackLineNum) || [] : [];
          const isHighlighted = lineFbs.some((f) => f.id === highlightedFeedbackId);
          const isInRange = feedbackLineNum ? rangeLines?.has(feedbackLineNum) || false : false;
          return (
            <React.Fragment key={idx}>
              <tr
                data-line={rightLineNum || undefined}
                className={`${styles.splitRow} ${selectedLine === feedbackLineNum ? styles.diffRowSelected : ''} ${isInRange ? styles.diffRowRangeHighlight : ''}`}
              >
                <td
                  className={`${styles.splitLineNum} ${row.left?.type === 'removed' ? styles.splitLineNumRemoved : ''}`}
                >
                  {lineFbs.length > 0 && <FeedbackBadgeDisplay feedbacks={lineFbs} isHighlighted={isHighlighted} />}
                  {leftLineNum ?? ''}
                </td>
                <td
                  className={`${styles.splitCode} ${row.left?.type === 'removed' ? styles.splitCodeRemoved : row.left?.type === 'unchanged' ? '' : styles.splitCodeEmpty}`}
                >
                  {row.left ? <HighlightedCode code={row.left.content} /> : null}
                </td>
                <td className={styles.splitGutter} />
                <td className={`${styles.splitLineNum} ${row.right?.type === 'added' ? styles.splitLineNumAdded : ''}`}>
                  {rightLineNum ?? ''}
                </td>
                <td
                  className={`${styles.splitCode} ${row.right?.type === 'added' ? styles.splitCodeAdded : row.right?.type === 'unchanged' ? '' : styles.splitCodeEmpty}`}
                >
                  {row.right ? <HighlightedCode code={row.right.content} /> : null}
                </td>
              </tr>
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// --- Unified Diff Table ---

function UnifiedDiffTable({
  hunks,
  feedbacksByLine,
  rangeLines,
  highlightedFeedbackId,
  selectedLine,
}: {
  hunks: DiffHunk[];
  feedbacksByLine?: Map<number, LineFeedback[]>;
  rangeLines?: Set<number>;
  highlightedFeedbackId?: string;
  selectedLine?: number;
}) {
  return (
    <table className={styles.diffTable}>
      <tbody>
        {hunks.map((hunk, hi) => (
          <React.Fragment key={hi}>
            {hunk.lines.map((line, li) => {
              const lineNum = line.newLineNumber ?? line.oldLineNumber;
              const lineFbs = lineNum ? feedbacksByLine?.get(lineNum) || [] : [];
              const isHighlighted = lineFbs.some((f) => f.id === highlightedFeedbackId);
              const isInRange = lineNum ? rangeLines?.has(lineNum) || false : false;
              return (
                <tr
                  key={`${hi}-${li}`}
                  data-line={lineNum || undefined}
                  className={`${styles.diffRow} ${line.type === 'added' ? styles.diffLineAdded : line.type === 'removed' ? styles.diffLineRemoved : ''} ${selectedLine === lineNum ? styles.diffRowSelected : ''} ${isInRange ? styles.diffRowRangeHighlight : ''}`}
                >
                  <td className={styles.lineNumCell}>
                    {lineFbs.length > 0 && <FeedbackBadgeDisplay feedbacks={lineFbs} isHighlighted={isHighlighted} />}
                    <span
                      className={
                        line.type === 'removed'
                          ? styles.lineNumRemoved
                          : line.type === 'added'
                            ? styles.lineNumAdded
                            : styles.lineNum
                      }
                    >
                      {line.oldLineNumber ?? ''}
                    </span>
                  </td>
                  <td className={styles.lineNumCell}>
                    <span
                      className={
                        line.type === 'added'
                          ? styles.lineNumAdded
                          : line.type === 'removed'
                            ? styles.lineNumRemoved
                            : styles.lineNum
                      }
                    >
                      {line.newLineNumber ?? ''}
                    </span>
                  </td>
                  <td className={styles.signCell}>
                    <span
                      className={
                        line.type === 'added' ? styles.signAdded : line.type === 'removed' ? styles.signRemoved : ''
                      }
                    >
                      {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                    </span>
                  </td>
                  <td className={styles.codeCell}>
                    <HighlightedCode code={line.content} />
                  </td>
                </tr>
              );
            })}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}

// --- Feedback Badge (pure display) ---

export function FeedbackBadgeDisplay({
  feedbacks,
  isHighlighted,
}: {
  feedbacks: LineFeedback[];
  isHighlighted?: boolean;
}) {
  if (feedbacks.length === 0) return null;
  const first = feedbacks[0];
  return (
    <span className={`${styles.feedbackBadge} ${isHighlighted ? styles.feedbackBadgeHighlighted : ''}`}>
      {first.user?.image ? (
        <img src={first.user.image} alt="" className={styles.feedbackBadgeAvatar} />
      ) : (
        <span className={styles.feedbackBadgeInitial}>{(first.user?.displayName || '?')[0]}</span>
      )}
      {feedbacks.length > 1 && <span className={styles.feedbackBadgeCount}>{feedbacks.length}</span>}
    </span>
  );
}

// --- Change Bar (pure) ---

export function ChangeBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions;
  if (total === 0) return null;
  const max = 5;
  const a = Math.round((additions / total) * max);
  const d = Math.round((deletions / total) * max);
  const e = Math.max(0, max - a - d);
  return (
    <span className={styles.changeBar}>
      {Array.from({ length: a }).map((_, i) => (
        <span key={`a${i}`} className={styles.changeBarAdd} />
      ))}
      {Array.from({ length: d }).map((_, i) => (
        <span key={`d${i}`} className={styles.changeBarDel} />
      ))}
      {Array.from({ length: e }).map((_, i) => (
        <span key={`e${i}`} className={styles.changeBarEmpty} />
      ))}
    </span>
  );
}

// --- Diff Parsing Utilities (pure functions) ---

export function parseDiffOutput(diffOutput: string): DiffHunk[] {
  const lines = diffOutput.split('\n');
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0,
    newLine = 0;
  for (const line of lines) {
    const m = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)/);
    if (m) {
      currentHunk = { header: line, lines: [] };
      hunks.push(currentHunk);
      oldLine = parseInt(m[1], 10);
      newLine = parseInt(m[2], 10);
      continue;
    }
    if (!currentHunk) continue;
    if (line.startsWith('\\')) continue; // "\ No newline at end of file" marker, not a content line
    if (line.startsWith('+')) {
      currentHunk.lines.push({ type: 'added', content: line.slice(1), newLineNumber: newLine++ });
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({ type: 'removed', content: line.slice(1), oldLineNumber: oldLine++ });
    } else {
      const c = line.startsWith(' ') ? line.slice(1) : line;
      currentHunk.lines.push({ type: 'unchanged', content: c, oldLineNumber: oldLine++, newLineNumber: newLine++ });
    }
  }
  return hunks;
}

/**
 * Split file content into lines, dropping the spurious trailing '' that `split('\n')` leaves when the
 * file ends in a newline (most files do). Without this a new/deleted file renders a phantom blank
 * added/removed line and the hunk header's line count is off by one.
 */
function splitFileLines(content: string): string[] {
  const lines = content.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** A single full file rendered as one hunk where every line is `added`. */
export function computeNewFileHunks(content: string): DiffHunk[] {
  const lines = splitFileLines(content);
  return [
    {
      header: `@@ -0,0 +1,${lines.length} @@`,
      lines: lines.map((line, i) => ({ type: 'added' as const, content: line, newLineNumber: i + 1 })),
    },
  ];
}

/** A single full file rendered as one hunk where every line is `removed`. */
export function computeDeletedFileHunks(content: string): DiffHunk[] {
  const lines = splitFileLines(content);
  return [
    {
      header: `@@ -1,${lines.length} +0,0 @@`,
      lines: lines.map((line, i) => ({ type: 'removed' as const, content: line, oldLineNumber: i + 1 })),
    },
  ];
}

export type FileDiffEntry = {
  fileName: string;
  hunks: DiffHunk[];
  status: string;
  additions: number;
  deletions: number;
};

type FileCompareData = { status: string; baseContent?: string; compareContent?: string };

/**
 * Turn a `fileName -> {status, baseContent, compareContent}` map into renderable file diffs,
 * choosing the right hunk builder per status and dropping no-op (UNCHANGED / zero-change) entries.
 * When `onPendingNew` is supplied, NEW files whose content hasn't arrived yet are diverted to it
 * (so the caller can fetch them lazily) instead of being diffed against empty content.
 */
export function buildFileDiffsFromMap(
  byName: Map<string, FileCompareData>,
  onPendingNew?: (fileName: string) => void
): FileDiffEntry[] {
  const diffs: FileDiffEntry[] = [];
  for (const [fileName, fileData] of byName.entries()) {
    if (fileData.status === 'UNCHANGED') continue;
    if (fileData.status === 'NEW' && fileData.compareContent === undefined && onPendingNew) {
      onPendingNew(fileName);
      continue;
    }
    const baseContent = fileData.baseContent || '';
    const compareContent = fileData.compareContent || '';
    let hunks: DiffHunk[];
    if (fileData.status === 'NEW') hunks = computeNewFileHunks(compareContent);
    else if (fileData.status === 'DELETED') hunks = computeDeletedFileHunks(baseContent);
    else hunks = computeDiffFromContent(baseContent, compareContent);

    const additions = hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.type === 'added').length, 0);
    const deletions = hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.type === 'removed').length, 0);
    if (additions > 0 || deletions > 0) diffs.push({ fileName, hunks, status: fileData.status, additions, deletions });
  }
  return diffs;
}

/** Shimmer placeholder shown while a diff tab's data loads. Mirrors the file-header + lines layout. */
export function DiffLoadingSkeleton({
  sections = 1,
  lines = 4,
  header = true,
}: {
  sections?: number;
  lines?: number;
  /** render the file-header bar above the lines (omit when a real header is already shown). */
  header?: boolean;
}) {
  return (
    <div>
      {Array.from({ length: sections }).map((_, s) => (
        <div key={s} className={styles.skeletonSection}>
          {header && (
            <div className={styles.skeletonHeader}>
              <div className={styles.skeleton} style={{ width: '30%', height: 14 }} />
              <div className={styles.skeleton} style={{ width: 60, height: 14 }} />
            </div>
          )}
          <div className={styles.skeletonLines}>
            {Array.from({ length: lines }).map((_l, i) => (
              <div key={i} className={styles.skeletonLine}>
                <div className={styles.skeleton} style={{ width: 30, height: 12 }} />
                <div className={styles.skeleton} style={{ width: 30, height: 12 }} />
                <div className={styles.skeleton} style={{ width: `${40 + (i % 3) * 20}%`, height: 12 }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function computeDiffFromContent(base: string, compare: string): DiffHunk[] {
  const patch = structuredPatch('', '', base, compare, '', '', { context: 3 });
  return patch.hunks.map((hunk) => {
    let oldCounter = hunk.oldStart,
      newCounter = hunk.newStart;
    return {
      header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      lines: hunk.lines
        // drop "\ No newline at end of file" markers — they aren't content lines
        .filter((line) => !line.startsWith('\\'))
        .map((line) => {
          const type = line.startsWith('+')
            ? ('added' as const)
            : line.startsWith('-')
              ? ('removed' as const)
              : ('unchanged' as const);
          const content = line.slice(1);
          const oldLineNumber = type !== 'added' ? oldCounter : undefined;
          const newLineNumber = type !== 'removed' ? newCounter : undefined;
          if (type !== 'added') oldCounter++;
          if (type !== 'removed') newCounter++;
          return { type, content, oldLineNumber, newLineNumber };
        }),
    };
  });
}
