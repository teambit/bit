import React, { useMemo, useState, useCallback } from 'react';
import { gql } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import type { ComponentID } from '@teambit/component-id';
import styles from './api-diff-view.module.scss';

export type APIDiffDetail = {
  changeKind: string;
  description: string;
  impact: string;
  from?: string;
  to?: string;
};

export type APIDiffChange = {
  status: 'ADDED' | 'REMOVED' | 'MODIFIED';
  visibility: 'public' | 'internal';
  exportName: string;
  schemaType: string;
  schemaTypeRaw: string;
  impact: string;
  baseSignature?: string;
  compareSignature?: string;
  changes?: APIDiffDetail[];
};

export type APIDiffResult = {
  hasChanges: boolean;
  impact: string;
  publicChanges: APIDiffChange[];
  internalChanges: APIDiffChange[];
  changes: APIDiffChange[];
  added: number;
  removed: number;
  modified: number;
  breaking: number;
  nonBreaking: number;
  patch: number;
};

export type ComponentDiffEntry = {
  componentId: ComponentID;
  sourceHead: string;
  targetHead?: string;
};

export type ApiDiffFullViewProps = {
  diffs: ComponentDiffEntry[];
};

const API_DIFF_QUERY = gql`
  query ApiDiff($baseId: String!, $compareId: String!) {
    getHost(id: "teambit.scope/scope") {
      apiDiff(baseId: $baseId, compareId: $compareId) {
        hasChanges
        impact
        added
        removed
        modified
        breaking
        nonBreaking
        patch
        publicChanges {
          status
          visibility
          exportName
          schemaType
          schemaTypeRaw
          impact
          baseSignature
          compareSignature
          changes {
            changeKind
            description
            impact
            from
            to
          }
        }
        internalChanges {
          status
          visibility
          exportName
          schemaType
          schemaTypeRaw
          impact
          baseSignature
          compareSignature
          changes {
            changeKind
            description
            impact
            from
            to
          }
        }
        changes {
          status
          visibility
          exportName
          schemaType
          schemaTypeRaw
          impact
          baseSignature
          compareSignature
          changes {
            changeKind
            description
            impact
            from
            to
          }
        }
      }
    }
  }
`;

function scopeColor(scope: string): string {
  let hash = 0;
  for (let i = 0; i < scope.length; i++) {
    hash = scope.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 55%, 50%)`;
}

function useApiDiff(baseId?: string, compareId?: string) {
  const { data, loading, error } = useDataQuery(API_DIFF_QUERY, {
    variables: { baseId: baseId || '', compareId: compareId || '' },
    skip: !baseId || !compareId,
  });

  const diff = useMemo((): APIDiffResult | null => {
    return data?.getHost?.apiDiff || null;
  }, [data, loading]);

  return { diff, loading, error: error?.message };
}

function ComponentApiDiff({
  diff,
  onLoaded,
}: {
  diff: ComponentDiffEntry;
  onLoaded?: (id: string, result: APIDiffResult | null) => void;
}) {
  const baseId = diff.targetHead ? diff.componentId.changeVersion(diff.targetHead)?.toString() : undefined;
  const compareId = diff.sourceHead ? diff.componentId.changeVersion(diff.sourceHead)?.toString() : undefined;

  const { diff: apiDiff, loading, error } = useApiDiff(baseId, compareId);
  const componentId = diff.componentId.toStringWithoutVersion();

  React.useEffect(() => {
    if (!loading) {
      onLoaded?.(
        componentId,
        apiDiff || {
          hasChanges: false,
          impact: 'NONE',
          publicChanges: [],
          internalChanges: [],
          changes: [],
          added: 0,
          removed: 0,
          modified: 0,
          breaking: 0,
          nonBreaking: 0,
          patch: 0,
        }
      );
    }
  }, [loading, apiDiff]);

  if (loading) {
    return (
      <div className={styles.card}>
        <div
          className={styles.cardHeader}
          style={{ '--scope-accent': scopeColor(diff.componentId.scope) } as React.CSSProperties}
        >
          <span className={styles.cardName}>{diff.componentId.fullName}</span>
          <span className={styles.cardLoading}>Analyzing API...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={styles.card}
        style={{ '--scope-accent': scopeColor(diff.componentId.scope) } as React.CSSProperties}
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardName}>{diff.componentId.fullName}</span>
          <span className={styles.cardUnavailable}>API diff unavailable</span>
        </div>
      </div>
    );
  }

  if (!apiDiff || !apiDiff.hasChanges) return null;

  return (
    <div
      className={styles.card}
      style={{ '--scope-accent': scopeColor(diff.componentId.scope) } as React.CSSProperties}
    >
      <div className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <span className={styles.cardName}>{diff.componentId.fullName}</span>
          <ImpactBadge impact={apiDiff.impact} />
        </div>
        <div className={styles.cardStats}>
          {apiDiff.added > 0 && <span className={styles.statAdded}>+{apiDiff.added} added</span>}
          {apiDiff.removed > 0 && <span className={styles.statRemoved}>{apiDiff.removed} removed</span>}
          {apiDiff.modified > 0 && <span className={styles.statModified}>{apiDiff.modified} modified</span>}
          {apiDiff.breaking > 0 && <span className={styles.statBreaking}>{apiDiff.breaking} breaking</span>}
        </div>
      </div>

      <div className={styles.cardBody}>
        {apiDiff.publicChanges.length > 0 && (
          <div className={styles.changeSection}>
            <div className={styles.changeSectionLabel}>Public API</div>
            {apiDiff.publicChanges.map((change, i) => (
              <ApiChangeRow key={`${change.exportName}-${i}`} change={change} />
            ))}
          </div>
        )}
        {apiDiff.internalChanges.length > 0 && (
          <div className={styles.changeSection}>
            <div className={styles.changeSectionLabel}>Internal</div>
            {apiDiff.internalChanges.map((change, i) => (
              <ApiChangeRow key={`${change.exportName}-${i}`} change={change} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ApiChangeRow({ change }: { change: APIDiffChange }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className={styles.changeRow}>
      <button className={styles.changeRowHeader} onClick={() => setExpanded(!expanded)}>
        <StatusIndicator status={change.status} />
        <span className={styles.exportName}>{change.exportName}</span>
        <span className={styles.schemaType}>{change.schemaType}</span>
        <ImpactBadge impact={change.impact} small />
        {change.changes && change.changes.length > 0 && (
          <span className={styles.changeCount}>
            {change.changes.length} detail{change.changes.length > 1 ? 's' : ''}
          </span>
        )}
        <span className={`${styles.expandIcon} ${expanded ? styles.expandIconOpen : ''}`}>›</span>
      </button>

      {expanded && (
        <div className={styles.changeDetails}>
          {change.baseSignature && (
            <div className={styles.signature}>
              <span className={styles.signatureLabel}>base</span>
              <code className={styles.signatureCode}>{change.baseSignature}</code>
            </div>
          )}
          {change.compareSignature && (
            <div className={styles.signature}>
              <span className={styles.signatureLabel}>compare</span>
              <code className={styles.signatureCode}>{change.compareSignature}</code>
            </div>
          )}
          {change.changes && change.changes.length > 0 && (
            <div className={styles.detailList}>
              {change.changes.map((detail, i) => (
                <div key={i} className={styles.detailRow}>
                  <ImpactDot impact={detail.impact} />
                  <span className={styles.detailDescription}>{detail.description}</span>
                  {detail.from && detail.to && (
                    <span className={styles.detailDiff}>
                      <code className={styles.detailFrom}>{detail.from}</code>
                      <span className={styles.detailArrow}>→</span>
                      <code className={styles.detailTo}>{detail.to}</code>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ApiDiffFullView({ diffs }: ApiDiffFullViewProps) {
  const eligible = useMemo(() => diffs.filter((d) => d.sourceHead && d.targetHead), [diffs]);

  const [stats, setStats] = useState<Map<string, APIDiffResult>>(new Map());
  const onDiffLoaded = useCallback((componentId: string, result: APIDiffResult | null) => {
    if (!result) return;
    setStats((prev) => {
      if (prev.get(componentId) === result) return prev;
      const next = new Map(prev);
      next.set(componentId, result);
      return next;
    });
  }, []);

  const totalStats = useMemo(() => {
    let added = 0,
      removed = 0,
      modified = 0,
      breaking = 0,
      withChanges = 0;
    stats.forEach((d) => {
      if (d.hasChanges) withChanges++;
      added += d.added;
      removed += d.removed;
      modified += d.modified;
      breaking += d.breaking;
    });
    return { added, removed, modified, breaking, withChanges, loaded: stats.size };
  }, [stats]);

  const allLoaded = totalStats.loaded >= eligible.length;

  if (eligible.length === 0) {
    return (
      <div className={styles.fullView}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <div className={styles.emptyTitle}>No components to compare</div>
          <div className={styles.emptySubtitle}>API diff requires components with both a base and compare version</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.fullView}>
      <div className={styles.summaryBar}>
        <div className={styles.summaryTitle}>
          <span className={styles.summaryHeading}>API Surface Changes</span>
          {!allLoaded && (
            <span className={styles.summaryLoading}>
              Analyzing {totalStats.loaded}/{eligible.length}...
            </span>
          )}
        </div>
        {allLoaded && totalStats.withChanges > 0 && (
          <div className={styles.summaryStats}>
            {totalStats.breaking > 0 && (
              <span className={styles.summaryStat}>
                <span
                  className={styles.summaryDot}
                  style={{ background: 'var(--on-surface-negative-bold, #cf222e)' }}
                />
                {totalStats.breaking} breaking
              </span>
            )}
            <span className={styles.summaryStat}>
              <span className={styles.summaryDot} style={{ background: 'var(--success-color, #1a7f37)' }} />
              {totalStats.added} added
            </span>
            <span className={styles.summaryStat}>
              <span className={styles.summaryDot} style={{ background: 'var(--on-surface-negative-bold, #cf222e)' }} />
              {totalStats.removed} removed
            </span>
            <span className={styles.summaryStat}>
              <span className={styles.summaryDot} style={{ background: 'var(--warning-color, #d6a022)' }} />
              {totalStats.modified} modified
            </span>
          </div>
        )}
      </div>

      {eligible.map((diff) => (
        <ComponentApiDiff key={diff.componentId.toStringWithoutVersion()} diff={diff} onLoaded={onDiffLoaded} />
      ))}

      {allLoaded && totalStats.withChanges === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>✓</div>
          <div className={styles.emptyTitle}>No API surface changes</div>
          <div className={styles.emptySubtitle}>
            All {eligible.length} component{eligible.length !== 1 ? 's' : ''} maintain their public API contract
          </div>
        </div>
      )}
    </div>
  );
}

function ImpactBadge({ impact, small }: { impact: string; small?: boolean }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    MAJOR: { bg: 'rgba(207, 34, 46, 0.1)', fg: 'var(--on-surface-negative-bold, #cf222e)' },
    MINOR: { bg: 'rgba(210, 153, 34, 0.1)', fg: 'var(--warning-color, #d6a022)' },
    PATCH: { bg: 'rgba(26, 127, 55, 0.08)', fg: 'var(--success-color, #1a7f37)' },
  };
  const c = colors[impact] || colors.PATCH;

  return (
    <span className={small ? styles.impactBadgeSmall : styles.impactBadge} style={{ background: c.bg, color: c.fg }}>
      {impact}
    </span>
  );
}

function StatusIndicator({ status }: { status: string }) {
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
    MAJOR: 'var(--on-surface-negative-bold, #cf222e)',
    MINOR: 'var(--warning-color, #d6a022)',
    PATCH: 'var(--success-color, #1a7f37)',
  };
  return <span className={styles.impactDot} style={{ background: colors[impact] || colors.PATCH }} />;
}
