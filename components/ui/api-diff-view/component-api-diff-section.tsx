import React, { useState } from 'react';
import type { ReactNode } from 'react';
import type { APIDiffChange, APIDiffResult, ImpactLevel } from './api-diff-model';
import { impactLabel, unavailableText } from './api-diff-model';
import { useApiDiffInsights } from './api-diff-insights';
import type { ApiDiffInsightContext } from './api-diff-insights';
import styles from './api-diff-view.module.scss';

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
          {change.baseSignature && (
            <code className={`${styles.signatureLine} ${styles.signatureRemoved}`}>− {change.baseSignature}</code>
          )}
          {change.compareSignature && (
            <code className={`${styles.signatureLine} ${styles.signatureAdded}`}>+ {change.compareSignature}</code>
          )}
        </div>
      )}

      {change.changes && change.changes.length > 0 && (
        <div className={styles.causeList}>
          {change.changes.map((detail, i) => (
            <div key={`${detail.changeKind}-${i}`} className={styles.causeRow}>
              <ImpactDot impact={detail.impact} />
              <span className={styles.causeDescription}>{detail.description}</span>
              {detail.from && detail.to && (
                <span className={styles.detailDiff}>
                  <code className={styles.detailFrom}>{detail.from}</code>
                  <span className={styles.detailArrow}>→</span>
                  <code className={styles.detailTo}>{detail.to}</code>
                </span>
              )}
              <ImpactBadge impact={detail.impact} small />
            </div>
          ))}
        </div>
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

  if (result.status !== 'COMPUTED') {
    return (
      <ApiDiffSlimRow
        componentIdStr={componentIdStr}
        displayName={displayName}
        chip="⚠ no API data"
        detail={unavailableText(result, baseVersion, compareVersion)}
        tone="warn"
      />
    );
  }

  const insightCtx: ApiDiffInsightContext = { componentId: componentIdStr, baseId, compareId, result };
  const publicChanges = result.publicChanges || [];
  const internalChanges = result.internalChanges || [];

  if (publicChanges.length === 0 && internalChanges.length === 0) {
    return (
      <ApiDiffSlimRow componentIdStr={componentIdStr} displayName={displayName} chip="✓ no API changes" tone="ok" />
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

      {publicChanges.map((change, i) => (
        <ApiChangeBlock
          key={`${change.exportName}-${i}`}
          change={change}
          anchorId={`${componentIdStr}:${change.exportName}`}
          focused={selectedExport === change.exportName}
          insightCtx={insightCtx}
        />
      ))}

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
    </div>
  );
}
