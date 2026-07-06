import React, { useMemo, useCallback } from 'react';
import type { ComponentID } from '@teambit/component-id';
import { ApiDiffDataProvider, useApiDiffData } from './api-diff-data-context';
import type { ApiDiffPair } from './api-diff-data-context';
import { ApiDiffInsightProvider } from './api-diff-insights';
import type { ApiDiffInsight } from './api-diff-insights';
import { ComponentApiDiffSection } from './component-api-diff-section';
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

const REGISTRY_STATUS: Record<string, string> = { ADDED: 'NEW', REMOVED: 'DELETED', MODIFIED: 'MODIFIED' };

function ComponentApiDiffContainer({
  entry,
  baseId,
  compareId,
  selectedExport,
  onApiEntries,
}: {
  entry: ComponentDiffEntry;
  /** versioned ids precomputed by the parent (see `ApiDiffEntry`) so they aren't re-derived per render. */
  baseId?: string;
  compareId?: string;
  selectedExport?: string;
  onApiEntries?: (componentId: string, entries: ApiEntry[]) => void;
}) {
  const componentIdStr = entry.componentId.toStringWithoutVersion();

  // read this pair's diff from the batched bulk query rather than firing a per-component query.
  // `undefined` = still loading (its page hasn't returned); `null` = couldn't be computed.
  const apiData = useApiDiffData();
  const providerLoading = apiData?.loading ?? true;
  const result = compareId ? apiData?.apiDiffFor(compareId) : undefined;
  const loading = result === undefined && providerLoading;

  // feed changed public exports to the host's sidebar tree (nested under the component, exactly like
  // files in code mode). the sidebar's scroll-sync then targets the `data-file-id="<componentId>:
  // <exportName>"` anchors rendered by ApiChangeBlock. once a pair's result is known we always register
  // — the changed exports when there are any, otherwise an empty list — so the host can tell "analyzed,
  // no API changes" (hide it, like code does) from "still analyzing" (unregistered).
  React.useEffect(() => {
    if (!onApiEntries || loading) return;
    const entries =
      result && result.status === 'COMPUTED'
        ? result.publicChanges.map((c) => ({ name: c.exportName, status: REGISTRY_STATUS[c.status] || 'MODIFIED' }))
        : [];
    onApiEntries(componentIdStr, entries);
  }, [result, loading, componentIdStr, onApiEntries]);

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
      selectedExport={selectedExport}
    />
  );
}

type ApiDiffEntry = {
  entry: ComponentDiffEntry;
  kind: EntryKind;
  /** versioned base/compare ids, resolved once here so `queryPairs`, totals, and visibility all reuse
   * them instead of each re-cloning the ComponentID + serializing per render. */
  baseId?: string;
  compareId?: string;
};

type ApiDiffTotals = {
  added: number;
  removed: number;
  modified: number;
  breaking: number;
  internal: number;
  withPublicChanges: number;
  withAnyChanges: number;
  unavailable: number;
  failed: number;
  loaded: number;
};

/**
 * derives everything the pane renders from the bulk-query provider (`useApiDiffData`) instead of a
 * per-child `onLoaded` mirror: the aggregate totals/progress, whether the surface is "stable", and a
 * per-component visibility predicate. Keeping the computation here (over the queried set only, so a
 * previous comparison's pairs can't leak in) lets the view be pure rendering.
 */
function useApiDiffAggregate(entries: ApiDiffEntry[], queried: ApiDiffEntry[]) {
  const apiData = useApiDiffData();
  const apiDiffFor = apiData?.apiDiffFor;

  const totals = useMemo<ApiDiffTotals>(() => {
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
    queried.forEach((e) => {
      const r = e.compareId ? apiDiffFor?.(e.compareId) : undefined;
      if (r === undefined) return; // its page hasn't resolved yet — not counted as loaded
      loaded += 1;
      if (r === null) {
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
  }, [apiDiffFor, queried]);

  const loadedCount = totals.loaded;
  const allLoaded = loadedCount >= queried.length;
  // gated entries were analyzed cheaply (no relevant changes → no query needed). failed
  // queries are NOT analyzed — they must not inflate the stable hero's claim.
  const gatedCount = useMemo(() => entries.filter((e) => e.kind === 'gated').length, [entries]);
  const analyzedCount = loadedCount - totals.unavailable - totals.failed + gatedCount;
  const stable = allLoaded && totals.withAnyChanges === 0 && totals.failed === 0 && analyzedCount > 0;

  // which components actually have a public-API diff to show: a queried pair that is still loading (keep
  // it visible so there's no flash) or that resolved to at least one public change. gated/incomparable
  // and computed-no-change pairs are dropped, so the pane lists only real diffs.
  const isVisible = useCallback(
    (e: ApiDiffEntry) => {
      if (e.kind !== 'query') return false;
      const r = e.compareId ? apiDiffFor?.(e.compareId) : undefined;
      if (r === undefined) return true; // still analyzing — keep visible
      return !!r && r.status === 'COMPUTED' && (r.publicChanges?.length || 0) > 0;
    },
    [apiDiffFor]
  );

  return { totals, loadedCount, allLoaded, analyzedCount, stable, isVisible };
}

/** pure rendering of the lane API view — runs under `ApiDiffDataProvider`, reads derived data from `useApiDiffAggregate`. */
function ApiDiffLaneBody({
  entries,
  queried,
  selectedId,
  selectedExport,
  onApiEntries,
}: {
  entries: ApiDiffEntry[];
  queried: ApiDiffEntry[];
  selectedId?: string;
  selectedExport?: string;
  onApiEntries?: (componentId: string, entries: ApiEntry[]) => void;
}) {
  const { totals, loadedCount, allLoaded, analyzedCount, stable, isVisible } = useApiDiffAggregate(entries, queried);

  return (
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

      {/* only components that actually have a public-API diff render (matching the code view, which
        hides components with no file changes). gated / incomparable / computed-no-change pairs are
        dropped; still-analyzing pairs stay so there's no flash. */}
      {entries.map((e) => {
        const idStr = e.entry.componentId.toStringWithoutVersion();
        if (!isVisible(e)) return null;
        return (
          <ComponentApiDiffContainer
            key={idStr}
            entry={e.entry}
            baseId={e.baseId}
            compareId={e.compareId}
            selectedExport={selectedId === idStr ? selectedExport : undefined}
            onApiEntries={onApiEntries}
          />
        );
      })}
    </div>
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
  const entries = useMemo<ApiDiffEntry[]>(
    () =>
      diffs.map((d) => ({
        entry: d,
        kind: classifyEntry(d),
        baseId: d.targetHead ? d.componentId.changeVersion(d.targetHead)?.toString() : undefined,
        compareId: d.sourceHead ? d.componentId.changeVersion(d.sourceHead)?.toString() : undefined,
      })),
    [diffs]
  );
  const queried = useMemo(() => entries.filter((e) => e.kind === 'query'), [entries]);

  // one bulk-query pair per component that needs a real diff (base = target head, compare = source head).
  // 'query' kind guarantees both heads exist, so these ids are always defined.
  const queryPairs = useMemo<ApiDiffPair[]>(
    () =>
      queried
        .map((e) => ({ baseId: e.baseId ?? '', compareId: e.compareId ?? '' }))
        .filter((p) => p.baseId && p.compareId),
    [queried]
  );

  // register an empty entry-list for every component that can't have a diff (no comparable pair, or no
  // API-relevant changes), so the host sidebar can tell these apart from still-analyzing ones and hide
  // them — mirroring how the code view hides components with no file changes.
  React.useEffect(() => {
    if (!onApiEntries) return;
    entries.forEach(({ entry, kind }) => {
      if (kind === 'gated' || kind === 'incomparable') onApiEntries(entry.componentId.toStringWithoutVersion(), []);
    });
  }, [entries, onApiEntries]);

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

  return (
    <ApiDiffInsightProvider insights={insights}>
      <ApiDiffDataProvider pairs={queryPairs} active={active} host={host}>
        <ApiDiffLaneBody
          entries={entries}
          queried={queried}
          selectedId={selectedId}
          selectedExport={selectedExport}
          onApiEntries={onApiEntries}
        />
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
