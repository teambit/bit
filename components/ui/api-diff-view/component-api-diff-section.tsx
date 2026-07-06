import React, { useState } from 'react';
import type { ReactNode } from 'react';
import { useHighlightedLines, resolveTokenColor, computeDiffLines } from '@teambit/code.ui.diff-viewer';
import type { DiffLineItem } from '@teambit/code.ui.diff-viewer';
import type { APIDiffChange, APIDiffDetail, APIDiffResult, ImpactLevel } from './api-diff-model';
import { impactLabel, unavailableText } from './api-diff-model';
import { useApiDiffInsights } from './api-diff-insights';
import type { ApiDiffInsightContext } from './api-diff-insights';
import styles from './api-diff-view.module.scss';

/**
 * public changes are grouped + ordered by impact so the most consequential ones are read first and
 * the list is scannable by category (breaking → minor → patch) rather than an arbitrary mix.
 */
const CHANGE_GROUPS: { key: string; label: string; match: (c: APIDiffChange) => boolean }[] = [
  { key: 'BREAKING', label: 'Breaking', match: (c) => c.impact === 'BREAKING' },
  { key: 'NON_BREAKING', label: 'Minor', match: (c) => c.impact === 'NON_BREAKING' },
  { key: 'PATCH', label: 'Patch', match: (c) => c.impact !== 'BREAKING' && c.impact !== 'NON_BREAKING' },
];

export function ImpactBadge({ impact, small }: { impact: ImpactLevel | string; small?: boolean }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    BREAKING: { bg: 'rgba(207, 34, 46, 0.1)', fg: 'var(--on-surface-negative-bold, #cf222e)' },
    NON_BREAKING: { bg: 'rgba(210, 153, 34, 0.1)', fg: 'var(--warning-color, #d6a022)' },
    PATCH: { bg: 'rgba(26, 127, 55, 0.08)', fg: 'var(--success-color, #1a7f37)' },
  };
  const c = colors[impact] || colors.PATCH;

  return (
    <span className={small ? styles.impactBadgeSmall : styles.impactBadge} style={{ background: c.bg, color: c.fg }}>
      {impactLabel(impact)}
    </span>
  );
}

export function StatusIndicator({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    ADDED: { label: '+', color: 'var(--success-color, #1a7f37)' },
    REMOVED: { label: '−', color: 'var(--on-surface-negative-bold, #cf222e)' },
    MODIFIED: { label: '~', color: 'var(--warning-color, #d6a022)' },
  };
  const c = config[status] || config.MODIFIED;

  return (
    <span className={styles.statusIndicator} style={{ color: c.color, borderColor: c.color }}>
      {c.label}
    </span>
  );
}

function ImpactDot({ impact }: { impact: string }) {
  const colors: Record<string, string> = {
    BREAKING: 'var(--on-surface-negative-bold, #cf222e)',
    NON_BREAKING: 'var(--warning-color, #d6a022)',
    PATCH: 'var(--success-color, #1a7f37)',
  };
  return <span className={styles.impactDot} style={{ background: colors[impact] || colors.PATCH }} />;
}

type Tok = { text: string; changed: boolean };

/** split into identifier / whitespace / punctuation tokens so the diff aligns on real boundaries. */
function tokenize(s: string): string[] {
  return s.match(/[A-Za-z0-9_$]+|\s+|[^A-Za-z0-9_$\s]/g) || [];
}

/**
 * token-level (word) diff of two signature strings via an LCS walk — marks exactly which tokens
 * were removed on the `from` side and added on the `to` side, so a one-character type change is
 * visible instead of two identical-looking lines.
 */
function tokenDiff(from: string, to: string): { fromParts: Tok[]; toParts: Tok[] } {
  const a = tokenize(from);
  const b = tokenize(to);
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const fromParts: Tok[] = [];
  const toParts: Tok[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      fromParts.push({ text: a[i], changed: false });
      toParts.push({ text: b[j], changed: false });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      fromParts.push({ text: a[i], changed: true });
      i++;
    } else {
      toParts.push({ text: b[j], changed: true });
      j++;
    }
  }
  while (i < m) fromParts.push({ text: a[i++], changed: true });
  while (j < n) toParts.push({ text: b[j++], changed: true });
  return { fromParts, toParts };
}

function DiffCode({ parts }: { parts: Tok[] }) {
  return (
    <span className={styles.diffCode}>
      {parts.map((p, i) =>
        // only emphasize meaningful (non-whitespace) changed tokens — highlighting spaces is noise.
        p.changed && p.text.trim() ? (
          <mark key={i} className={styles.diffTok}>
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  );
}

/**
 * a before/after signature shown as a git-style stacked diff with token-level highlighting: the
 * removed line over the added line, full-width monospace, aligned gutter, and only the tokens that
 * actually differ emphasized.
 *
 * When both sides are present and identical, the public signature didn't move (the change is
 * internal/transitive). Rather than render a confusing two-line "diff" of identical text — or nothing
 * at all, which is impossible to understand — show the signature ONCE as a neutral context line so
 * the reader still sees the member's type and can tell it's unchanged at the surface.
 */
function DiffPair({ from, to }: { from?: string; to?: string }) {
  if (from && to && from === to) {
    return (
      <div className={styles.diffBlock}>
        <code className={`${styles.diffLine} ${styles.diffLineContext}`}>
          <span className={styles.diffGutter} aria-hidden="true">
            ·
          </span>
          <span className={styles.diffCode}>{from}</span>
          <span className={styles.diffContextNote}>public signature unchanged</span>
        </code>
      </div>
    );
  }
  const diff = from && to ? tokenDiff(from, to) : undefined;

  return (
    <div className={styles.diffBlock}>
      {from && (
        <code className={`${styles.diffLine} ${styles.diffLineRemoved}`}>
          <span className={styles.diffGutter} aria-hidden="true">
            −
          </span>
          {diff ? <DiffCode parts={diff.fromParts} /> : <span className={styles.diffCode}>{from}</span>}
        </code>
      )}
      {to && (
        <code className={`${styles.diffLine} ${styles.diffLineAdded}`}>
          <span className={styles.diffGutter} aria-hidden="true">
            +
          </span>
          {diff ? <DiffCode parts={diff.toParts} /> : <span className={styles.diffCode}>{to}</span>}
        </code>
      )}
    </div>
  );
}

// ── member-cause grouping (severity clusters + collapse-by-kind) ──────────────

type CauseKind = 'add' | 'remove' | 'modify' | 'doc';

/** the severity buckets, ordered breaking → minor → patch. */
const SEVERITY_TIERS: { key: string; label: string; match: (impact: string) => boolean }[] = [
  { key: 'BREAKING', label: 'Breaking', match: (i) => i === 'BREAKING' },
  { key: 'NON_BREAKING', label: 'Minor', match: (i) => i === 'NON_BREAKING' },
  { key: 'PATCH', label: 'Patch', match: (i) => i !== 'BREAKING' && i !== 'NON_BREAKING' },
];

/**
 * TS quick-info signatures are prefixed with the member kind and owning type, e.g.
 * `(property) AttReact.oxlintConfigPath: string`. Pull the kind out (for collapse-by-kind) and strip
 * the `(kind) Owner.` prefix so the snippet reads as a clean declaration (`oxlintConfigPath: string`).
 */
function parseSignature(sig: string | undefined, ownerName: string): { kind?: string; clean: string } {
  if (!sig) return { clean: '' };
  const m = sig.match(/^\(([a-z][a-z ]*)\)\s+([\s\S]*)$/);
  if (!m) return { clean: sig };
  let body = m[2];
  const qualifier = `${ownerName}.`;
  if (body.startsWith(qualifier)) body = body.slice(qualifier.length);
  return { kind: m[1].trim(), clean: body };
}

type ClassifiedCause = { detail: APIDiffDetail; type: CauseKind; kind?: string; clean: string };

function classifyCause(detail: APIDiffDetail, ownerName: string): ClassifiedCause {
  const ck = detail.changeKind || '';
  if (ck === 'member-added') {
    const { kind, clean } = parseSignature(detail.to, ownerName);
    return { detail, type: 'add', kind, clean };
  }
  if (ck === 'member-removed') {
    const { kind, clean } = parseSignature(detail.from, ownerName);
    return { detail, type: 'remove', kind, clean };
  }
  // documentation-only changes carry prose (not a signature) in from/to — render as a note, never a snippet.
  if (ck.includes('documentation')) return { detail, type: 'doc', clean: '' };
  return { detail, type: 'modify', clean: '' };
}

function pluralizeKind(kind: string, n: number): string {
  if (n === 1) return kind;
  if (kind.endsWith('y')) return `${kind.slice(0, -1)}ies`;
  return `${kind}s`;
}

/** leading identifier of a cleaned signature (`foo(): T` → `foo`, `bar: string` → `bar`). */
function memberNameFromSignature(clean: string): string {
  return clean.match(/^[A-Za-z0-9_$]+/)?.[0] || clean;
}

/** concise label for a modified/structural cause — drops the inline `: from → to` the diff already shows. */
function modifyLabel(detail: APIDiffDetail): string {
  return (detail.description || detail.changeKind || 'changed').split(/:|—/)[0].trim();
}

/**
 * one signature rendered with the diff-viewer's shiki highlighter. shiki paints sentinel colors that
 * must be translated to Bit's design-system syntax vars via `resolveTokenColor` (rendering the raw
 * sentinels shows garish yellow/red). Falls back to plain monospace while the grammar loads.
 */
function HighlightedSignature({ code }: { code: string }) {
  const lines = useHighlightedLines(code, 'typescript');
  if (!lines) return <>{code}</>;
  return (
    <>
      {lines.map((tokens, li) => (
        <React.Fragment key={li}>
          {li > 0 ? '\n' : null}
          {tokens.map((t, ti) => {
            const color = resolveTokenColor(t.color);
            return (
              <span key={ti} style={color ? { color } : undefined}>
                {t.content}
              </span>
            );
          })}
        </React.Fragment>
      ))}
    </>
  );
}

/**
 * a single added/removed signature line. Rendered on a NEUTRAL surface (not a green/red fill) so the
 * syntax colors — tuned for a light code background — always clear WCAG contrast; the add/remove
 * signal comes from the gutter marker + the block's colored left edge, never from text-on-tint.
 */
function SignatureLine({ clean, tone }: { clean: string; tone: 'add' | 'remove' }) {
  return (
    <code className={styles.sigLine}>
      <span className={styles.diffGutter} aria-hidden="true">
        {tone === 'add' ? '+' : '−'}
      </span>
      <span className={styles.diffCode}>
        <HighlightedSignature code={clean} />
      </span>
    </code>
  );
}

/** a collapsed add/remove cluster: one label ("4 properties added") over a stack of signature lines. */
function CollapsedCauses({ causes, type }: { causes: ClassifiedCause[]; type: 'add' | 'remove' }) {
  const verb = type === 'add' ? 'added' : 'removed';
  const kind = causes[0].kind || 'member';
  const single = causes.length === 1;

  return (
    <div className={styles.memberGroup}>
      <div className={styles.memberLabel}>
        {single ? (
          <>
            <b className={styles.memberName}>{memberNameFromSignature(causes[0].clean)}</b>
            <span className={styles.memberKind}>
              {kind} {verb}
            </span>
          </>
        ) : (
          <>
            <b className={styles.memberName}>
              {causes.length} {pluralizeKind(kind, causes.length)}
            </b>
            <span className={styles.memberKind}>{verb}</span>
          </>
        )}
      </div>
      <div className={`${styles.sigBlock} ${type === 'add' ? styles.sigBlockAdd : styles.sigBlockRemove}`}>
        {causes.map((c, i) => (
          <SignatureLine key={`${c.clean}-${i}`} clean={c.clean} tone={type} />
        ))}
      </div>
    </div>
  );
}

/** collapse same-kind add/remove causes into one cluster each, preserving input order of first appearance. */
function collapseByKind(causes: ClassifiedCause[]): ClassifiedCause[][] {
  const buckets = new Map<string, ClassifiedCause[]>();
  for (const c of causes) {
    const key = c.kind || 'member';
    const arr = buckets.get(key);
    if (arr) arr.push(c);
    else buckets.set(key, [c]);
  }
  return [...buckets.values()];
}

/** render one modified/structural cause: a concise label over the token-level before/after diff. */
function ModifiedCause({ detail }: { detail: APIDiffDetail }) {
  return (
    <div className={styles.memberGroup}>
      <div className={styles.memberLabel}>
        <b className={styles.memberName}>{modifyLabel(detail)}</b>
      </div>
      {(detail.from || detail.to) && <DiffPair from={detail.from} to={detail.to} />}
    </div>
  );
}

/**
 * one prose line of a doc diff, emphasizing only the intra-line char ranges that actually changed
 * (the `intra` ranges computed by `computeDiffLines`). Unlike code, prose is NOT syntax-highlighted —
 * only the changed words/phrases get a `<mark>` so the rest reads as context. Ranges are half-open,
 * sorted and non-overlapping, so a single left-to-right walk covers the line.
 */
function ProseLine({ line }: { line: DiffLineItem }) {
  const { text, intra } = line;
  if (!intra || intra.length === 0) return <>{text || ' '}</>;
  const out: ReactNode[] = [];
  let pos = 0;
  let key = 0;
  for (const [s, e] of intra) {
    if (s > pos) out.push(<span key={key++}>{text.slice(pos, s)}</span>);
    out.push(
      <mark key={key++} className={styles.docTok}>
        {text.slice(s, e)}
      </mark>
    );
    pos = e;
  }
  if (pos < text.length) out.push(<span key={key++}>{text.slice(pos)}</span>);
  return <>{out}</>;
}

/**
 * a real documentation *change* (both a before and an after) rendered as a git-style stacked diff:
 * removed lines over added lines with context lines between, and — exactly like the code view — only
 * the words/characters that actually changed emphasized (via `computeDiffLines`' intra ranges). This
 * replaces the old "whole `from` in red / whole `to` in green" blocks so a one-word doc edit reads as
 * one word, not two near-identical paragraphs.
 */
function DocDiff({ from, to }: { from: string; to: string }) {
  const lines = computeDiffLines(from, to);
  return (
    <>
      {lines.map((line, i) => {
        const tone =
          line.type === 'add' ? styles.docAdded : line.type === 'del' ? styles.docRemoved : styles.docUnchanged;
        const gutter = line.type === 'add' ? '+' : line.type === 'del' ? '−' : '·';
        return (
          <div key={i} className={`${styles.docLine} ${tone}`}>
            <span className={styles.diffGutter} aria-hidden="true">
              {gutter}
            </span>
            <span className={styles.docText}>
              <ProseLine line={line} />
            </span>
          </div>
        );
      })}
    </>
  );
}

/**
 * a documentation-only cause. Beyond the label, it shows the actual doc/comment prose that was
 * removed (red) and/or added (green) — so "documentation removed" reveals *what* was removed rather
 * than just stating it. Doc text is prose (never a signature), so it renders as dark text on a faint
 * tint (dark-on-tint clears contrast) with no syntax highlighting. When BOTH sides are present (a real
 * change) it renders a line-level diff with only the changed words emphasized, like the code view; a
 * pure removal/addition (one side) keeps the single-block form. Falls back to a plain note when
 * neither side carries text.
 */
function NoteCause({ detail, ownerName }: { detail: APIDiffDetail; ownerName: string }) {
  if (!detail.from && !detail.to && !detail.signature) {
    return (
      <div className={styles.memberNote}>
        <ImpactDot impact={detail.impact} />
        <span className={styles.causeDescription}>{detail.description}</span>
      </div>
    );
  }
  // the declaration this doc belongs to, shown as an unchanged context line beneath the doc diff.
  const contextSignature = detail.signature ? parseSignature(detail.signature, ownerName).clean : undefined;
  return (
    <div className={styles.memberGroup}>
      <div className={styles.memberLabel}>
        <b className={styles.memberName}>{modifyLabel(detail)}</b>
        <span className={styles.memberKind}>documentation {docVerb(detail.changeKind)}</span>
      </div>
      <div className={styles.docBlock}>
        {detail.from && detail.to ? (
          // a real change — show the within-block diff (changed words emphasized), like the code view.
          <DocDiff from={detail.from} to={detail.to} />
        ) : (
          // pure removal or pure addition — nothing to intra-diff, so keep the single-block form.
          <>
            {detail.from && (
              <div className={`${styles.docLine} ${styles.docRemoved}`}>
                <span className={styles.diffGutter} aria-hidden="true">
                  −
                </span>
                <span className={styles.docText}>{detail.from}</span>
              </div>
            )}
            {detail.to && (
              <div className={`${styles.docLine} ${styles.docAdded}`}>
                <span className={styles.diffGutter} aria-hidden="true">
                  +
                </span>
                <span className={styles.docText}>{detail.to}</span>
              </div>
            )}
          </>
        )}
        {contextSignature && (
          <code className={`${styles.docLine} ${styles.docContext}`}>
            <span className={styles.diffGutter} aria-hidden="true">
              ·
            </span>
            <span className={styles.diffCode}>
              <HighlightedSignature code={contextSignature} />
            </span>
          </code>
        )}
      </div>
    </div>
  );
}

function docVerb(changeKind: string): string {
  if (changeKind.includes('removed')) return 'removed';
  if (changeKind.includes('added')) return 'added';
  return 'changed';
}

/**
 * the reworked cause list: member changes clustered by severity (breaking → minor → patch), and
 * within each tier the additions/removals collapse by kind into signature snippets (with the diff-
 * viewer's highlighting), modifications keep the token-level before/after diff, and doc-only changes
 * render as notes. This makes a long flat list scannable by consequence and shows every add/remove
 * as its real signature instead of a prose line.
 */
function CauseClusters({ details, ownerName }: { details: APIDiffDetail[]; ownerName: string }) {
  const classified = details.map((d) => classifyCause(d, ownerName));

  return (
    <div className={styles.causeClusters}>
      {SEVERITY_TIERS.map((tier) => {
        const tierCauses = classified.filter((c) => tier.match(c.detail.impact));
        if (tierCauses.length === 0) return null;

        const removes = tierCauses.filter((c) => c.type === 'remove');
        const modifies = tierCauses.filter((c) => c.type === 'modify');
        const adds = tierCauses.filter((c) => c.type === 'add');
        const notes = tierCauses.filter((c) => c.type === 'doc');

        return (
          <div key={tier.key} className={`${styles.severityGroup} ${styles[`severity_${tier.key}`]}`}>
            <div className={styles.severityHeader}>
              <span className={styles.severityLabel}>{tier.label}</span>
              <span className={styles.severityCount}>{tierCauses.length}</span>
            </div>
            {collapseByKind(removes).map((bucket, i) => (
              <CollapsedCauses key={`rem-${i}`} causes={bucket} type="remove" />
            ))}
            {modifies.map((c, i) => (
              <ModifiedCause key={`mod-${i}`} detail={c.detail} />
            ))}
            {collapseByKind(adds).map((bucket, i) => (
              <CollapsedCauses key={`add-${i}`} causes={bucket} type="add" />
            ))}
            {notes.map((c, i) => (
              <NoteCause key={`doc-${i}`} detail={c.detail} ownerName={ownerName} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export type ApiChangeBlockProps = {
  change: APIDiffChange;
  /** anchor id used by the compare sidebar scroll-sync (`data-file-id="<componentId>:<exportName>"`) */
  anchorId?: string;
  focused?: boolean;
  dimmed?: boolean;
  insightCtx?: ApiDiffInsightContext;
};

/**
 * one API change, fully expanded: what changed (signatures), why it carries its
 * impact (assessed change facts), and any slot-contributed insights.
 */
export function ApiChangeBlock({ change, anchorId, focused, dimmed, insightCtx }: ApiChangeBlockProps) {
  const insights = useApiDiffInsights();
  const matching = insightCtx ? insights.filter((i) => !i.matches || i.matches(change, insightCtx)) : [];

  return (
    <div
      className={`${styles.changeBlock}${focused ? ` ${styles.changeBlockFocused}` : ''}${dimmed ? ` ${styles.changeBlockDimmed}` : ''}`}
      data-file-id={anchorId}
    >
      <div className={styles.changeBlockHeader}>
        <StatusIndicator status={change.status} />
        <span className={styles.exportName}>{change.exportName}</span>
        <span className={styles.schemaType}>{change.schemaType}</span>
        <ImpactBadge impact={change.impact} small />
        {change.status === 'ADDED' && <span className={styles.changeBlockNote}>added to {change.visibility} API</span>}
        {change.status === 'REMOVED' && (
          <span className={styles.changeBlockNote}>removed from {change.visibility} API</span>
        )}
      </div>

      {(change.baseSignature || change.compareSignature) && (
        <div className={styles.signatures}>
          <DiffPair from={change.baseSignature} to={change.compareSignature} />
        </div>
      )}

      {change.changes && change.changes.length > 0 && (
        <CauseClusters details={change.changes} ownerName={change.exportName} />
      )}

      {matching.length > 0 && (
        <div className={styles.insights}>
          {matching.map((insight) => (
            <div key={insight.id} className={styles.insight}>
              {insight.render(change, insightCtx!)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type ApiDiffSlimRowProps = {
  componentIdStr: string;
  displayName: string;
  chip: ReactNode;
  detail?: ReactNode;
  tone?: 'ok' | 'warn' | 'error';
  /** renders an expand affordance; children are shown when expanded */
  expandable?: boolean;
  children?: ReactNode;
};

/**
 * component-level one-liner for components without renderable public changes:
 * "no API changes", "no API data" (with reason), errors, and internal-only changes
 * (expandable). always carries the `data-component-id` anchor so sidebar selection
 * can scroll to it.
 */
export function ApiDiffSlimRow({
  componentIdStr,
  displayName,
  chip,
  detail,
  tone = 'ok',
  expandable,
  children,
}: ApiDiffSlimRowProps) {
  const [expanded, setExpanded] = useState(false);
  const toneClass = tone === 'warn' ? styles.slimChipWarn : tone === 'error' ? styles.slimChipError : styles.slimChipOk;

  const content = (
    <>
      <span className={styles.slimName}>{displayName}</span>
      <span className={`${styles.slimChip} ${toneClass}`}>{chip}</span>
      {detail && <span className={styles.slimDetail}>{detail}</span>}
      {expandable && <span className={`${styles.slimExpand}${expanded ? ` ${styles.slimExpandOpen}` : ''}`}>›</span>}
    </>
  );

  return (
    <div className={styles.slimRowWrapper} data-component-id={componentIdStr}>
      {expandable ? (
        <button className={`${styles.slimRow} ${styles.slimRowButton}`} onClick={() => setExpanded(!expanded)}>
          {content}
        </button>
      ) : (
        <div className={styles.slimRow}>{content}</div>
      )}
      {expanded && children && <div className={styles.slimExpanded}>{children}</div>}
    </div>
  );
}

/**
 * A neutral blank state for when there's genuinely no API to compare — NEITHER version exposes a
 * public API (e.g. both built before extraction, no extractor, or extraction disabled). Distinct
 * from the amber "Schema unavailable" warning, which flags that ONE side couldn't be read (an
 * actionable gap: pick a different version). Here there's nothing to act on, so it reads calm.
 */
export function ApiDiffBlankState({
  componentIdStr,
  title,
  detail,
}: {
  componentIdStr: string;
  title: string;
  detail?: ReactNode;
}) {
  return (
    <div className={styles.apiBlankState} data-component-id={componentIdStr}>
      <div className={styles.apiBlankIcon} aria-hidden="true">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1" />
          <path d="M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1" />
        </svg>
      </div>
      <div className={styles.apiBlankTitle}>{title}</div>
      {detail && <div className={styles.apiBlankDetail}>{detail}</div>}
    </div>
  );
}

export type ComponentApiDiffSectionProps = {
  /** component id without version — used for anchors and registry keys */
  componentIdStr: string;
  displayName: string;
  baseId?: string;
  compareId?: string;
  baseVersion?: string;
  compareVersion?: string;
  result: APIDiffResult | null | undefined;
  loading?: boolean;
  error?: string;
  /** export name currently selected in the sidebar — gets the focus treatment */
  selectedExport?: string;
};

/**
 * full per-component API diff treatment. renders one of:
 * - loading shimmer
 * - error / unavailable-with-reason slim row
 * - "no API changes" slim row
 * - internal-only expandable slim row
 * - full section: header + public change blocks + collapsed internal section
 *
 * used by both the lane compare full-pane view and the single-component compare tab.
 */
export function ComponentApiDiffSection({
  componentIdStr,
  displayName,
  baseId,
  compareId,
  baseVersion,
  compareVersion,
  result,
  loading,
  error,
  selectedExport,
}: ComponentApiDiffSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);

  if (loading) {
    return (
      <div className={styles.section} data-component-id={componentIdStr}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionName}>{displayName}</span>
          <span className={styles.sectionLoading}>Analyzing API…</span>
        </div>
        <div className={styles.sectionSkeleton}>
          <div className={styles.skeletonBar} style={{ width: '38%' }} />
          <div className={styles.skeletonBar} style={{ width: '62%' }} />
          <div className={styles.skeletonBar} style={{ width: '47%' }} />
        </div>
      </div>
    );
  }

  if (error || result === null) {
    return (
      <ApiDiffSlimRow
        componentIdStr={componentIdStr}
        displayName={displayName}
        chip="⚠ API diff failed"
        detail={error}
        tone="error"
      />
    );
  }

  if (!result) {
    // result === undefined with loading false means the query was skipped (same version on
    // both sides / missing id). still render an anchored row so the component doesn't
    // silently vanish from the pane and sidebar clicks have a scroll target.
    return (
      <ApiDiffSlimRow
        componentIdStr={componentIdStr}
        displayName={displayName}
        chip="nothing to compare"
        detail="no diffable version pair"
        tone="ok"
      />
    );
  }

  // NEITHER side has an API — there's genuinely nothing to compare (both built before extraction,
  // no extractor, or extraction disabled). A calm blank state, not a warning: nothing to act on.
  if (result.status === 'UNAVAILABLE') {
    return (
      <ApiDiffBlankState
        componentIdStr={componentIdStr}
        title="No API to compare"
        detail={unavailableText(result, baseVersion, compareVersion) || 'neither version exposes a public API'}
      />
    );
  }

  // ONE side's API could not be read (e.g. that version was built before API extraction). This is
  // NOT "no changes" — we couldn't compare at all — and it's actionable (pick another version), so it
  // stays an amber warning naming the version/reason.
  if (result.status !== 'COMPUTED') {
    return (
      <ApiDiffSlimRow
        componentIdStr={componentIdStr}
        displayName={displayName}
        chip="⚠ Schema unavailable"
        detail={unavailableText(result, baseVersion, compareVersion) || 'could not compare API for these versions'}
        tone="warn"
      />
    );
  }

  const insightCtx: ApiDiffInsightContext = { componentId: componentIdStr, baseId, compareId, result };
  const publicChanges = result.publicChanges || [];
  const internalChanges = result.internalChanges || [];
  const unresolvedExports = result.unresolvedExports || [];

  if (publicChanges.length === 0 && internalChanges.length === 0) {
    // Extraction couldn't read some exports but nothing actually changed — say so plainly instead of a
    // clean "no API changes", so an incomplete analysis isn't mistaken for a verified no-op.
    if (unresolvedExports.length > 0) {
      return (
        <ApiDiffSlimRow
          componentIdStr={componentIdStr}
          displayName={displayName}
          chip={`⚠ ${unresolvedExports.length} couldn't be analyzed`}
          detail={`extraction incomplete for ${unresolvedExports.join(', ')}, not a change`}
          tone="warn"
        />
      );
    }
    // Computed successfully and the public API is identical — a real, verified no-op (distinct from
    // "Schema unavailable" above, where we couldn't read the API at all).
    return (
      <ApiDiffSlimRow
        componentIdStr={componentIdStr}
        displayName={displayName}
        chip="✓ No API changes"
        detail="the public API is identical between these versions"
        tone="ok"
      />
    );
  }

  if (publicChanges.length === 0) {
    return (
      <ApiDiffSlimRow
        componentIdStr={componentIdStr}
        displayName={displayName}
        chip="no public API changes"
        detail={`${internalChanges.length} internal change${internalChanges.length > 1 ? 's' : ''}`}
        tone="ok"
        expandable
      >
        {internalChanges.map((change, i) => (
          <ApiChangeBlock key={`${change.exportName}-${i}`} change={change} dimmed insightCtx={insightCtx} />
        ))}
      </ApiDiffSlimRow>
    );
  }

  const stats = {
    added: publicChanges.filter((c) => c.status === 'ADDED').length,
    removed: publicChanges.filter((c) => c.status === 'REMOVED').length,
    modified: publicChanges.filter((c) => c.status === 'MODIFIED').length,
    breaking: publicChanges.filter((c) => c.impact === 'BREAKING').length,
  };

  return (
    <div className={styles.section} data-component-id={componentIdStr}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionName}>{displayName}</span>
        <ImpactBadge impact={result.impact} />
        {baseVersion && compareVersion && (
          <span className={styles.sectionVersions}>
            {baseVersion.slice(0, 7)} → {compareVersion.slice(0, 7)}
          </span>
        )}
        <span className={styles.sectionStats}>
          {stats.added > 0 && <span className={styles.statAdded}>+{stats.added} added</span>}
          {stats.removed > 0 && <span className={styles.statRemoved}>{stats.removed} removed</span>}
          {stats.modified > 0 && <span className={styles.statModified}>{stats.modified} modified</span>}
          {stats.breaking > 0 && <span className={styles.statBreaking}>{stats.breaking} breaking</span>}
        </span>
      </div>

      {CHANGE_GROUPS.map((group) => {
        const groupChanges = publicChanges.filter(group.match);
        if (groupChanges.length === 0) return null;
        return (
          <div key={group.key} className={styles.changeGroup}>
            <div className={styles.changeGroupHeader}>
              <span className={styles.changeGroupDot} data-impact={group.key} />
              <span className={styles.changeGroupLabel}>{group.label}</span>
              <span className={styles.changeGroupCount}>{groupChanges.length}</span>
            </div>
            {groupChanges.map((change, i) => (
              <ApiChangeBlock
                key={`${change.exportName}-${i}`}
                change={change}
                anchorId={`${componentIdStr}:${change.exportName}`}
                focused={selectedExport === change.exportName}
                insightCtx={insightCtx}
              />
            ))}
          </div>
        );
      })}

      {internalChanges.length > 0 && (
        <div className={styles.internalSection}>
          <button className={styles.internalToggle} onClick={() => setInternalExpanded(!internalExpanded)}>
            <span className={`${styles.slimExpand}${internalExpanded ? ` ${styles.slimExpandOpen}` : ''}`}>›</span>
            Internal changes
            <span className={styles.internalCount}>{internalChanges.length}</span>
            <ImpactBadge impact={result.internalImpact} small />
          </button>
          {internalExpanded &&
            internalChanges.map((change, i) => (
              <ApiChangeBlock key={`${change.exportName}-${i}`} change={change} dimmed insightCtx={insightCtx} />
            ))}
        </div>
      )}

      {unresolvedExports.length > 0 && (
        <div className={styles.unresolvedNote}>
          <span className={styles.unresolvedIcon} aria-hidden="true">
            ⚠
          </span>
          <span className={styles.unresolvedText}>
            {unresolvedExports.length} export{unresolvedExports.length > 1 ? 's' : ''} couldn&apos;t be analyzed (
            {unresolvedExports.join(', ')}). Extraction was incomplete on one side, so this isn&apos;t reported as a
            change.
          </span>
        </div>
      )}
    </div>
  );
}
