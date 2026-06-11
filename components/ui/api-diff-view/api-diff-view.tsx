import React, { useMemo, useState, useCallback } from 'react';
import type { ComponentID } from '@teambit/component-id';
import type { APIDiffResult } from './api-diff-model';
import { useApiDiff } from './api-diff-model';
import { ApiDiffInsightProvider } from './api-diff-insights';
import type { ApiDiffInsight } from './api-diff-insights';
import { ComponentApiDiffSection, ApiDiffSlimRow } from './component-api-diff-section';
import styles from './api-diff-view.module.scss';

export type ComponentDiffEntry = {
  componentId: ComponentID;
  /** head of the compare side (the lane under review) */
  sourceHead?: string;
  /** head of the base side — absent for components that are new on the lane */
  targetHead?: string;
  /** lane-diff change types for this component (e.g. SOURCE_CODE, DEPENDENCY) — used to
   * skip the API diff query for components whose API cannot have changed */
  changes?: string[];
};

export type ApiEntry = { name: string; status: string };

export type ApiDiffLaneViewProps = {
  diffs: ComponentDiffEntry[];
  /** GraphQL host id, e.g. "teambit.scope/scope" */
  host?: string;
  /** component currently selected in the sidebar */
  selectedId?: string;
  /** export name currently selected in the sidebar */
  selectedExport?: string;
  /** slot-contributed insight renderers (see `registerApiDiffInsight`) */
  insights?: ApiDiffInsight[];
  /**
   * called when a component's changed public exports are known — the host view
   * feeds these into its sidebar tree (kept as a callback so this component stays
   * registry-agnostic and avoids a dependency cycle with component-compare).
   */
  onApiEntries?: (componentId: string, entries: ApiEntry[]) => void;
};

/** change types that can affect a component's API surface. config/docs-only changes can't. */
const API_RELEVANT_CHANGES = new Set(['SOURCE_CODE', 'NEW', 'DEPENDENCY']);

type EntryKind = 'query' | 'gated' | 'new';

function classifyEntry(entry: ComponentDiffEntry): EntryKind {
  if (!entry.sourceHead || !entry.targetHead) return 'new';
  if (entry.changes && !entry.changes.some((c) => API_RELEVANT_CHANGES.has(c))) return 'gated';
  return 'query';
}

const REGISTRY_STATUS: Record<string, string> = { ADDED: 'NEW', REMOVED: 'DELETED', MODIFIED: 'MODIFIED' };

function ComponentApiDiffContainer({
  entry,
  host,
  selectedExport,
  onLoaded,
  onApiEntries,
}: {
  entry: ComponentDiffEntry;
  host?: string;
  selectedExport?: string;
  onLoaded: (id: string, result: APIDiffResult | null) => void;
  onApiEntries?: (componentId: string, entries: ApiEntry[]) => void;
}) {
  const baseId = entry.targetHead ? entry.componentId.changeVersion(entry.targetHead)?.toString() : undefined;
  const compareId = entry.sourceHead ? entry.componentId.changeVersion(entry.sourceHead)?.toString() : undefined;
  const componentIdStr = entry.componentId.toStringWithoutVersion();

  const { result, loading, error } = useApiDiff(baseId, compareId, { host });

  React.useEffect(() => {
    if (!loading) onLoaded(componentIdStr, result ?? null);
  }, [loading, result, componentIdStr, onLoaded]);

  // feed changed public exports to the host's sidebar tree (nested under the component,
  // exactly like files in code mode). the sidebar's scroll-sync then targets the
  // `data-file-id="<componentId>:<exportName>"` anchors rendered by ApiChangeBlock.
  React.useEffect(() => {
    if (!onApiEntries || !result || result.status !== 'COMPUTED') return;
    onApiEntries(
      componentIdStr,
      result.publicChanges.map((c) => ({ name: c.exportName, status: REGISTRY_STATUS[c.status] || 'MODIFIED' }))
    );
  }, [result, componentIdStr, onApiEntries]);

  return (
    <ComponentApiDiffSection
      componentIdStr={componentIdStr}
      displayName={entry.componentId.fullName}
      baseId={baseId}
      compareId={compareId}
      baseVersion={entry.targetHead}
      compareVersion={entry.sourceHead}
      result={result}
      loading={loading}
      error={error}
      selectedExport={selectedExport}
    />
  );
}

/**
 * full-pane API diff for a set of component pairs (lane compare's API view).
 * always renders every component (sections for changed ones, slim rows for the rest);
 * selection from the sidebar scrolls — it never filters.
 */
export function ApiDiffLaneView({ diffs, host, selectedId, selectedExport, insights, onApiEntries }: ApiDiffLaneViewProps) {
  const entries = useMemo(() => diffs.map((d) => ({ entry: d, kind: classifyEntry(d) })), [diffs]);
  const queried = useMemo(() => entries.filter((e) => e.kind === 'query'), [entries]);

  const [results, setResults] = useState<Map<string, APIDiffResult | null>>(new Map());
  const onDiffLoaded = useCallback((componentId: string, result: APIDiffResult | null) => {
    setResults((prev) => {
      if (prev.has(componentId) && prev.get(componentId) === result) return prev;
      const next = new Map(prev);
      next.set(componentId, result);
      return next;
    });
  }, []);

  const totals = useMemo(() => {
    let added = 0;
    let removed = 0;
    let modified = 0;
    let breaking = 0;
    let internal = 0;
    let withPublicChanges = 0;
    let withAnyChanges = 0;
    let unavailable = 0;
    results.forEach((r) => {
      if (!r) return;
      if (r.status !== 'COMPUTED') {
        unavailable += 1;
        return;
      }
      const pub = r.publicChanges || [];
      added += pub.filter((c) => c.status === 'ADDED').length;
      removed += pub.filter((c) => c.status === 'REMOVED').length;
      modified += pub.filter((c) => c.status === 'MODIFIED').length;
      breaking += pub.filter((c) => c.impact === 'BREAKING').length;
      internal += (r.internalChanges || []).length;
      if (pub.length > 0) withPublicChanges += 1;
      if (r.hasChanges) withAnyChanges += 1;
    });
    return { added, removed, modified, breaking, internal, withPublicChanges, withAnyChanges, unavailable };
  }, [results]);

  const loadedCount = results.size;
  const allLoaded = loadedCount >= queried.length;

  if (entries.length === 0) {
    return (
      <div className={styles.fullView}>
        <EmptyState
          icon="⊘"
          tone="neutral"
          title="No components to compare"
          subtitle="API diff requires components with both a base and compare version."
        />
      </div>
    );
  }

  const allNew = entries.every((e) => e.kind === 'new');
  if (allNew) {
    return (
      <div className={styles.fullView}>
        <EmptyState
          icon="⊘"
          tone="neutral"
          title="Nothing to compare yet"
          subtitle={`All ${entries.length} component${entries.length !== 1 ? 's' : ''} here are new on this lane — there's no base version to diff against. Their full API is on each component's API Reference tab.`}
        />
      </div>
    );
  }

  const stable = allLoaded && totals.withAnyChanges === 0;
  // gated entries were analyzed cheaply (no relevant changes → no query needed)
  const gatedCount = entries.filter((e) => e.kind === 'gated').length;
  const analyzedCount = queried.length - totals.unavailable + gatedCount;

  return (
    <ApiDiffInsightProvider insights={insights}>
      <div className={styles.fullView}>
        <div className={styles.summaryBar}>
          <div className={styles.summaryTitle}>
            <span className={styles.summaryHeading}>API Surface Changes</span>
            {!allLoaded && (
              <span className={styles.summaryLoading}>
                Analyzing {loadedCount} of {queried.length}…
              </span>
            )}
          </div>
          {!allLoaded && queried.length > 0 && (
            <div className={styles.summaryProgress}>
              <div
                className={styles.summaryProgressFill}
                style={{ width: `${Math.round((loadedCount / queried.length) * 100)}%` }}
              />
            </div>
          )}
          {allLoaded && totals.withAnyChanges > 0 && (
            <div className={styles.summaryStats}>
              {totals.breaking > 0 && (
                <span className={styles.summaryStat}>
                  <span
                    className={styles.summaryDot}
                    style={{ background: 'var(--on-surface-negative-bold, #cf222e)' }}
                  />
                  {totals.breaking} breaking
                </span>
              )}
              <span className={styles.summaryStat}>
                <span className={styles.summaryDot} style={{ background: 'var(--success-color, #1a7f37)' }} />
                {totals.added} added
              </span>
              <span className={styles.summaryStat}>
                <span className={styles.summaryDot} style={{ background: 'var(--on-surface-negative-bold, #cf222e)' }} />
                {totals.removed} removed
              </span>
              <span className={styles.summaryStat}>
                <span className={styles.summaryDot} style={{ background: 'var(--warning-color, #d6a022)' }} />
                {totals.modified} modified
              </span>
              {totals.internal > 0 && <span className={styles.summaryStatMuted}>{totals.internal} internal</span>}
            </div>
          )}
        </div>

        {stable && (
          <EmptyState
            icon="✓"
            tone="success"
            title="API surface is stable"
            subtitle={`${analyzedCount} component${analyzedCount !== 1 ? 's' : ''} analyzed — no API changes between these versions.`}
          />
        )}

        {entries.map(({ entry, kind }) => {
          const idStr = entry.componentId.toStringWithoutVersion();
          if (kind === 'new') {
            // hidden in the stable state — the hero already accounts for analyzed components,
            // and new components carry no diffable API.
            if (stable) return null;
            return (
              <ApiDiffSlimRow
                key={idStr}
                componentIdStr={idStr}
                displayName={entry.componentId.fullName}
                chip="new component"
                detail="no base version to compare"
                tone="ok"
              />
            );
          }
          if (kind === 'gated') {
            if (stable) return null;
            return (
              <ApiDiffSlimRow
                key={idStr}
                componentIdStr={idStr}
                displayName={entry.componentId.fullName}
                chip="✓ no API changes"
                detail="no source or dependency changes"
                tone="ok"
              />
            );
          }
          // in the stable state only surface the rows that need attention (no data / errors)
          if (stable) {
            const r = results.get(idStr);
            if (r && r.status === 'COMPUTED') return null;
          }
          return (
            <ComponentApiDiffContainer
              key={idStr}
              entry={entry}
              host={host}
              selectedExport={selectedId === idStr ? selectedExport : undefined}
              onLoaded={onDiffLoaded}
              onApiEntries={onApiEntries}
            />
          );
        })}
      </div>
    </ApiDiffInsightProvider>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
  tone,
}: {
  icon: string;
  title: string;
  subtitle: string;
  tone: 'success' | 'neutral';
}) {
  return (
    <div className={styles.emptyState}>
      <div className={`${styles.emptyIcon}${tone === 'neutral' ? ` ${styles.emptyIconNeutral}` : ''}`}>{icon}</div>
      <div className={styles.emptyTitle}>{title}</div>
      <div className={styles.emptySubtitle}>{subtitle}</div>
    </div>
  );
}

/** @deprecated use ApiDiffLaneView */
export const ApiDiffFullView = ApiDiffLaneView;
export type ApiDiffFullViewProps = ApiDiffLaneViewProps;
