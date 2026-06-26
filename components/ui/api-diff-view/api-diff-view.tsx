import React, { useMemo, useState, useCallback } from 'react';
import type { ComponentID } from '@teambit/component-id';
import type { APIDiffResult } from './api-diff-model';
import { ApiDiffDataProvider, useApiDiffData } from './api-diff-data-context';
import type { ApiDiffPair } from './api-diff-data-context';
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
  /**
   * whether the API view is the active view. The pane is kept mounted (for scroll anchors + query
   * cache) even when hidden, so without this every component would fire its API-diff query on initial
   * load — N expensive schema-extraction round trips that clog the network before the user ever opens
   * the API tab. Queries fire only once this is true; results stay cached afterwards.
   */
  active?: boolean;
};

/** change types that can affect a component's API surface. config/docs-only changes can't. */
const API_RELEVANT_CHANGES = new Set(['SOURCE_CODE', 'NEW', 'DEPENDENCY']);

type EntryKind = 'query' | 'gated' | 'incomparable';

function classifyEntry(entry: ComponentDiffEntry): EntryKind {
  // missing targetHead: new on the lane OR unrelated histories; missing sourceHead: not on
  // this lane. either way there's no base/compare pair to diff.
  if (!entry.sourceHead || !entry.targetHead) return 'incomparable';
  // same snap on both sides — identical API by definition, and useApiDiff would skip anyway.
  if (entry.sourceHead === entry.targetHead) return 'gated';
  // gate only on explicit evidence: an empty changes array is treated as unknown, not as
  // "verified no changes".
  if (entry.changes && entry.changes.length > 0 && !entry.changes.some((c) => API_RELEVANT_CHANGES.has(c))) {
    return 'gated';
  }
  return 'query';
}

/** copy for components without a comparable pair — new components are the common case */
function incomparableCopy(entry: ComponentDiffEntry): { chip: string; detail: string } {
  if (entry.changes?.includes('NEW')) return { chip: 'new component', detail: 'no base version to compare' };
  return { chip: 'not comparable', detail: 'no common base version between these lanes' };
}

const REGISTRY_STATUS: Record<string, string> = { ADDED: 'NEW', REMOVED: 'DELETED', MODIFIED: 'MODIFIED' };

function ComponentApiDiffContainer({
  entry,
  selectedExport,
  onLoaded,
  onApiEntries,
  active,
}: {
  entry: ComponentDiffEntry;
  selectedExport?: string;
  onLoaded: (id: string, result: APIDiffResult | null) => void;
  onApiEntries?: (componentId: string, entries: ApiEntry[]) => void;
  active?: boolean;
}) {
  const baseId = entry.targetHead ? entry.componentId.changeVersion(entry.targetHead)?.toString() : undefined;
  const compareId = entry.sourceHead ? entry.componentId.changeVersion(entry.sourceHead)?.toString() : undefined;
  const componentIdStr = entry.componentId.toStringWithoutVersion();

  // read this pair's diff from the batched bulk query rather than firing a per-component query.
  // `undefined` = still loading (its page hasn't returned); `null` = couldn't be computed.
  const apiData = useApiDiffData();
  const providerLoading = apiData?.loading ?? true;
  const result = compareId ? apiData?.getApiDiff(compareId) : undefined;
  const loading = result === undefined && providerLoading;
  const error = undefined;

  React.useEffect(() => {
    // don't mark a pair "loaded" while its page is still in flight, or the totals/progress would
    // count it as failed before the bulk query reaches it. the `active` guard keeps a hidden pane
    // (whose bulk query is skipped) from reporting everything as loaded/failed prematurely.
    if (active && !loading) onLoaded(componentIdStr, result ?? null);
  }, [active, loading, result, componentIdStr, onLoaded]);

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
export function ApiDiffLaneView({
  diffs,
  host,
  selectedId,
  selectedExport,
  insights,
  onApiEntries,
  active,
}: ApiDiffLaneViewProps) {
  const entries = useMemo(() => diffs.map((d) => ({ entry: d, kind: classifyEntry(d) })), [diffs]);
  const queried = useMemo(() => entries.filter((e) => e.kind === 'query'), [entries]);

  // one bulk-query pair per component that needs a real diff (base = target head, compare = source head).
  // 'query' kind guarantees both heads exist, so these ids are always defined.
  const queryPairs = useMemo<ApiDiffPair[]>(
    () =>
      queried
        .map(({ entry }) => ({
          baseId: entry.componentId.changeVersion(entry.targetHead)?.toString() ?? '',
          compareId: entry.componentId.changeVersion(entry.sourceHead)?.toString() ?? '',
        }))
        .filter((p) => p.baseId && p.compareId),
    [queried]
  );

  const [results, setResults] = useState<Map<string, APIDiffResult | null>>(new Map());
  const onDiffLoaded = useCallback((componentId: string, result: APIDiffResult | null) => {
    setResults((prev) => {
      if (prev.has(componentId) && prev.get(componentId) === result) return prev;
      const next = new Map(prev);
      next.set(componentId, result);
      return next;
    });
  }, []);

  // aggregate only over the CURRENT queried set — the results map is append-only, so if
  // `diffs` changes while mounted, entries from a previous comparison must not leak into
  // the totals or the progress count.
  const totals = useMemo(() => {
    let added = 0;
    let removed = 0;
    let modified = 0;
    let breaking = 0;
    let internal = 0;
    let withPublicChanges = 0;
    let withAnyChanges = 0;
    let unavailable = 0;
    let failed = 0;
    let loaded = 0;
    queried.forEach(({ entry }) => {
      const idStr = entry.componentId.toStringWithoutVersion();
      if (!results.has(idStr)) return;
      loaded += 1;
      const r = results.get(idStr);
      if (!r) {
        failed += 1;
        return;
      }
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
    return {
      added,
      removed,
      modified,
      breaking,
      internal,
      withPublicChanges,
      withAnyChanges,
      unavailable,
      failed,
      loaded,
    };
  }, [results, queried]);

  const loadedCount = totals.loaded;
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

  const allIncomparable = entries.every((e) => e.kind === 'incomparable');
  if (allIncomparable) {
    return (
      <div className={styles.fullView}>
        <EmptyState
          icon="⊘"
          tone="neutral"
          title="Nothing to compare yet"
          subtitle={`None of the ${entries.length} component${entries.length !== 1 ? 's' : ''} here have a comparable base version — most are new on this lane. Their full API is on each component's API Reference tab.`}
        />
      </div>
    );
  }

  // gated entries were analyzed cheaply (no relevant changes → no query needed). failed
  // queries are NOT analyzed — they must not inflate the stable hero's claim.
  const gatedCount = entries.filter((e) => e.kind === 'gated').length;
  const analyzedCount = loadedCount - totals.unavailable - totals.failed + gatedCount;
  const stable = allLoaded && totals.withAnyChanges === 0 && totals.failed === 0 && analyzedCount > 0;

  return (
    <ApiDiffInsightProvider insights={insights}>
      <ApiDiffDataProvider pairs={queryPairs} active={active} host={host}>
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
                  <span
                    className={styles.summaryDot}
                    style={{ background: 'var(--on-surface-negative-bold, #cf222e)' }}
                  />
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

          {/* every component always renders (sections or slim rows) — even in the stable
            state — so the sidebar's data-component-id scroll anchors always exist. */}
          {entries.map(({ entry, kind }) => {
            const idStr = entry.componentId.toStringWithoutVersion();
            if (kind === 'incomparable') {
              const copy = incomparableCopy(entry);
              return (
                <ApiDiffSlimRow
                  key={idStr}
                  componentIdStr={idStr}
                  displayName={entry.componentId.fullName}
                  chip={copy.chip}
                  detail={copy.detail}
                  tone="ok"
                />
              );
            }
            if (kind === 'gated') {
              const sameVersion = entry.sourceHead === entry.targetHead;
              return (
                <ApiDiffSlimRow
                  key={idStr}
                  componentIdStr={idStr}
                  displayName={entry.componentId.fullName}
                  chip="✓ no API changes"
                  detail={sameVersion ? 'same version on both sides' : 'no source or dependency changes'}
                  tone="ok"
                />
              );
            }
            return (
              <ComponentApiDiffContainer
                key={idStr}
                entry={entry}
                selectedExport={selectedId === idStr ? selectedExport : undefined}
                onLoaded={onDiffLoaded}
                onApiEntries={onApiEntries}
                active={active}
              />
            );
          })}
        </div>
      </ApiDiffDataProvider>
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
