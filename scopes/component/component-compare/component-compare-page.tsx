import type { HTMLAttributes } from 'react';
import React, { useContext, useEffect, useMemo, useState } from 'react';
import classnames from 'classnames';
import { useSearchParams } from 'react-router-dom';
import { ComponentContext, ComponentDescriptorContext, useComponent } from '@teambit/component';
import type { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import {
  ComponentCompareContext,
  InlineCompareEmpty,
  useComponentCompare,
} from '@teambit/component.ui.component-compare.context';
import { ComponentCompareVersionPicker } from '@teambit/component.ui.component-compare.version-picker';
import { useCompareQueryParam } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { sortByDateDsc } from '@teambit/component.ui.component-compare.utils.sort-logs';
import { groupByVersion } from '@teambit/component.ui.component-compare.utils.group-by-version';
import type { LegacyComponentLog } from '@teambit/legacy-component-log';
import {
  CompareDataProvider,
  CompareToolbar,
  CompareToolbarActions,
  DiffModeProvider,
  DepsFilterProvider,
  FileRegistryProvider,
  InlineComponentCompare,
  RegistryFeeder,
  useCompareData,
} from '@teambit/component.ui.component-compare.component-compare';
import type { CompareViewMode, ComponentComparePair } from '@teambit/component.ui.component-compare.component-compare';
import { computeDepsDiff } from '@teambit/dependencies.ui.deps-diff-table';
import { useApiDiff } from '@teambit/semantics.ui.api-diff-view';

import styles from './component-compare-page.module.scss';

export type ComponentComparePageProps = {
  host: string;
  tabs: TabItem[] | (() => TabItem[]);
  /**
   * Lazily resolves the API compare element (contributed by the api-reference aspect). Resolved at
   * render — not construction — so it doesn't depend on UI-provider registration order. When it
   * yields an element, the page exposes an `api` view mode; the element is only mounted while that
   * view is active, so its diff query fires on-demand.
   */
  getApiTab?: () => React.ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>;

type ViewMode = 'code' | 'preview' | 'docs' | 'dependencies' | 'tests' | 'config' | 'api';
type DiffMode = 'split' | 'unified';

// The single-component compare offers the same view modes as lane-compare. Which ones actually
// appear is driven by real per-view content counts (see `CompareView`) — mirroring how the cloud
// changes view derives available views from each component's change types, so a user never lands
// on a view that has nothing to show. `api` is only listed when the api-reference aspect supplies
// an API tab (see `getApiTab`); like lane-compare it's always available then (the view renders its
// own "nothing to compare" state), since we only fetch the diff once the view is opened.
// Order mirrors lane-compare exactly (API first), so the two compare surfaces read identically.
const COMPARE_VIEW_MODES: CompareViewMode[] = [
  { id: 'api', displayName: 'API', icon: 'schema' },
  { id: 'code', displayName: 'Code', icon: 'code' },
  { id: 'preview', displayName: 'Preview', icon: 'eye' },
  { id: 'docs', displayName: 'Docs', icon: 'overview' },
  { id: 'dependencies', displayName: 'Dependencies', icon: 'link' },
  { id: 'tests', displayName: 'Tests', icon: 'test' },
  { id: 'config', displayName: 'Configuration', icon: 'configuration' },
];

function findPrevVersionFromCurrent(currentVersion?: string) {
  return (log: LegacyComponentLog, index: number, logs: LegacyComponentLog[]) => {
    if (!currentVersion) return index === 1;
    const prevIndex = logs.findIndex((l) => (l.tag || l.hash) === currentVersion) + 1;
    return index === prevIndex;
  };
}

export function ComponentComparePage({
  host: hostFromProps,
  tabs,
  getApiTab,
  className,
  ...rest
}: ComponentComparePageProps) {
  // `component` from ComponentContext is authoritative for the compare side — mirrors legacy
  // `ComponentCompare` which never loaded a separate compareModel when there was no override.
  // Loading a separate copy via useComponent risks an id string that differs from the live
  // workspace component (e.g. no version), which breaks the server's local-changes detection
  // (`computeCompare`: `comparingWithLocalChanges = workspace && baseId === compareId`).
  const component = useContext(ComponentContext);
  const componentDescriptor = useContext(ComponentDescriptorContext);

  const resolvedTabs = useMemo(() => (typeof tabs === 'function' ? tabs() : tabs), [tabs]);
  const apiTab = useMemo(() => getApiTab?.(), [getApiTab]);

  const baseVersion = useCompareQueryParam('baseVersion');
  // The compare side follows the component page's main version dropdown, which sets `?version`.
  // When it's set the user is viewing a specific published version, so we compare against THAT
  // version (clean); when absent we default to the live workspace. Read the exact `version` key —
  // NOT `search.includes('version')`, which the old code used and which also matched `baseVersion`,
  // wrongly flipping this whenever a base was picked.
  const compareVersionParam = useCompareQueryParam('version');
  const isWorkspace = hostFromProps === 'teambit.workspace/workspace';

  const allVersionInfo = useMemo(
    () => component.logs?.slice().sort(sortByDateDsc) || [],
    [component.id.toString(), component.logs?.length]
  );
  const isNew = allVersionInfo.length === 0;
  // "workspace" (live on-disk files, incl. uncommitted) only when NO specific version is selected.
  // With `?version` set, the compare side is that clean version — the server then diffs it as a real
  // version instead of the live workspace (`computeCompare`'s `compareIsLiveWorkspace`).
  const compareHasLocalChanges = isWorkspace && !isNew && !compareVersionParam;

  // Pick the base version: explicit URL param > previous published version > current.
  // The default base is the *previous* published version so the workspace compare shows the changes
  // since that version (committed + uncommitted). Defaulting to the current checked-out version made
  // base === compare, so the diff was empty and the view collapsed to its always-on sections.
  const lastVersionInfo = useMemo(
    () => allVersionInfo.find(findPrevVersionFromCurrent(component.id.version)),
    [allVersionInfo, component.id.version]
  );

  const baseId = useMemo(
    () =>
      (baseVersion && component.id.changeVersion(baseVersion)) ||
      (lastVersionInfo && component.id.changeVersion(lastVersionInfo.tag || lastVersionInfo.hash)) ||
      component.id,
    [baseVersion, lastVersionInfo?.tag, lastVersionInfo?.hash, component.id.toString()]
  );

  const {
    component: base,
    componentDescriptor: baseComponentDescriptor,
    loading: baseLoading,
    error: baseError,
  } = useComponent('teambit.scope/scope', baseId?.toString(), { skip: !baseId || isNew });

  // The base model is fetched asynchronously. Until it resolves we must report `loading: true` —
  // otherwise consumers (the toolbar counts, the dependency diff, etc.) observe `base === undefined`
  // with `loading === false` and wrongly treat the component as new (no base + has compare),
  // deriving bogus "everything changed" data before the comparison is actually stable. We treat the
  // base as loading until the model is present (not just until Apollo's flag flips), which also
  // covers the skip→fetch transition where the flag is briefly false with no model yet.
  const baseModelLoading = !isNew && !!baseId && !baseError && (!!baseLoading || !base);

  // The compare side is always the checked-out component. In workspace mode the server recognises
  // this as the live workspace and diffs the base snap against the on-disk files (so uncommitted
  // changes are included) — see `computeCompare`'s `compareIsLiveWorkspace`. The base then differs
  // from the compare (previous version vs. current), which is what surfaces the real change set.
  const baseIdStr = baseId?.toString();
  const compareIdStr = component.id.toString();

  // When the resolved base and compare point at the exact same version (and we are not diffing
  // live workspace changes against a snap), there is nothing to diff. This is common: a
  // single-version component, or the user picking the same version on both sides. Without this
  // the whole pane just blanks out, so we show an explicit "identical versions" state instead.
  const isSameVersion = !isNew && !compareHasLocalChanges && !!baseIdStr && baseIdStr === compareIdStr;

  const logsByVersion = useMemo(
    () => (component.logs || []).slice().reduce(groupByVersion, new Map<string, LegacyComponentLog>()),
    [component.id.toString(), component.logs?.length]
  );

  // Build a minimal ComponentCompareContext for the version picker (it only reads
  // `compare.model.logs`, `compare.model.version`, and `base.model.version`). Data for the
  // diff itself flows through `CompareDataProvider` → `InlineContextProvider` inside
  // `InlineComponentCompare`, which sets its own inner context with the file/aspect/test maps.
  const componentCompareModel = useMemo(
    () => ({
      compare: {
        model: component,
        descriptor: componentDescriptor,
        hasLocalChanges: compareHasLocalChanges,
      },
      base: base && {
        model: base,
        descriptor: baseComponentDescriptor,
      },
      // `!component.logs` ⇒ the compare component's version history hasn't loaded yet, so `isNew`
      // (derived from it) is not yet known. Stay in loading until it resolves — otherwise we briefly
      // treat the component as new (no base) and render the wrong toolbar before the base/diff load.
      loading: !component.logs || baseModelLoading,
      logsByVersion,
      isFullScreen: true,
      hidden: false,
    }),
    [
      component,
      base?.id.toString(),
      componentDescriptor,
      baseComponentDescriptor,
      compareHasLocalChanges,
      logsByVersion,
      baseModelLoading,
    ]
  );

  const pair: ComponentComparePair | null = useMemo(() => {
    if (isNew || isSameVersion || !baseIdStr || !compareIdStr) return null;
    return { baseId: baseIdStr, compareId: compareIdStr };
  }, [isNew, isSameVersion, baseIdStr, compareIdStr]);
  const pairs = useMemo(() => (pair ? [pair] : []), [pair]);

  // Map the registered inline tabs to view-mode ids so `CompareView` only counts/shows modes that
  // are actually registered (e.g. there is no `docs` inline tab today). The `api` view is not an
  // inline tab — it's supplied separately by `getApiTab` — so append it here when available.
  const registeredModeIds = useMemo(() => {
    const ids = resolvedTabs.map((t) => inlineTabIdToViewMode(t.id)).filter(Boolean) as ViewMode[];
    if (apiTab) ids.push('api');
    return ids;
  }, [resolvedTabs, apiTab]);

  const baseVersionShort = baseId?.version?.slice(0, 7);
  const compareVersionShort = compareHasLocalChanges ? 'workspace' : (component.id.version || '').slice(0, 7);

  return (
    <ComponentCompareContext.Provider value={componentCompareModel as any}>
      <CompareDataProvider pairs={pairs}>
        <FileRegistryProvider>
          <RegistryFeeder pairs={pairs} />
          <div className={classnames(styles.page, className)} {...rest}>
            <div className={styles.versionPickerRow}>
              <ComponentCompareVersionPicker
                componentId={component.id.toStringWithoutVersion()}
                baseVersion={baseId?.version}
                compareVersion={component.id.version}
                compareHasLocalChanges={compareHasLocalChanges}
                host={hostFromProps}
              />
            </div>

            {isSameVersion ? (
              <div className={styles.blankState}>
                <InlineCompareEmpty
                  message="No changes to compare"
                  baseVersion={baseVersionShort}
                  compareVersion={compareVersionShort}
                  hint="Both sides point to the same version. Pick a different base above to compare."
                />
              </div>
            ) : (
              <CompareView
                isNew={isNew}
                name={component.id.fullName}
                baseId={isNew ? undefined : baseIdStr}
                compareId={compareIdStr || component.id.toString()}
                baseVersionShort={baseVersionShort}
                compareVersionShort={compareVersionShort}
                resolvedTabs={resolvedTabs}
                registeredModeIds={registeredModeIds}
                apiTab={apiTab}
                host={hostFromProps}
              />
            )}
          </div>
        </FileRegistryProvider>
      </CompareDataProvider>
    </ComponentCompareContext.Provider>
  );
}

type CompareViewProps = {
  isNew: boolean;
  name: string;
  baseId?: string;
  compareId: string;
  baseVersionShort?: string;
  compareVersionShort?: string;
  resolvedTabs: TabItem[];
  registeredModeIds: ViewMode[];
  /** API compare element, rendered only while the `api` view is active (on-demand fetch). */
  apiTab?: React.ReactNode;
  host: string;
};

/**
 * Renders the toolbar + diff pane. Lives inside `CompareDataProvider` so it can read the bulk
 * compare result and derive real per-view counts: a view mode only appears when it has content
 * (code files changed, compositions exist, aspects changed, …), so the user never clicks into an
 * empty view. Mirrors the cloud changes view, which gates each view on the component's change types.
 */
function CompareView({
  isNew,
  name,
  baseId,
  compareId,
  baseVersionShort,
  compareVersionShort,
  resolvedTabs,
  registeredModeIds,
  apiTab,
  host,
}: CompareViewProps) {
  const [searchParams] = useSearchParams();
  const [viewMode, setViewModeState] = useState<ViewMode>((searchParams.get('view') as ViewMode) || 'code');
  const [diffMode, setDiffModeState] = useState<DiffMode>((searchParams.get('diffMode') as DiffMode) || 'split');
  const [showAllDeps, setShowAllDeps] = useState(false);

  const syncUrl = React.useCallback((key: string, value: string | undefined) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.history.replaceState(null, '', url.toString());
  }, []);

  const setViewMode = React.useCallback(
    (v: ViewMode) => {
      setViewModeState(v);
      syncUrl('view', v === 'code' ? undefined : v);
    },
    [syncUrl]
  );
  const setDiffMode = React.useCallback(
    (d: DiffMode) => {
      setDiffModeState(d);
      syncUrl('diffMode', d === 'split' ? undefined : d);
    },
    [syncUrl]
  );

  const componentCompare = useComponentCompare();
  const compareData = useCompareData();
  const data = compareData?.getData(compareId);
  const dataLoading = compareData?.loading ?? false;

  // The API view mode appears when there's something meaningful to show. Unlike the bulk
  // code/aspect/test data, the API diff is a separate query — fetch it here (cheap: one pair) so the
  // count is real. The API tab element self-fetches the same query when opened, so Apollo serves it
  // from cache (no double round-trip). Skipped entirely when there's no API tab registered.
  const { result: apiDiffResult, loading: apiDiffLoading } = useApiDiff(baseId, compareId, { skip: !apiTab });
  // A per-version extraction gap (a side built before API extraction, or a failed extraction) is a
  // "couldn't compute" state worth surfacing — NOT the same as "no changes". Distinct from a
  // component-wide DISABLED/NO_EXTRACTOR (a component that simply has no API), which stays hidden so
  // the tab isn't noise on non-API components.
  const apiExtractionGap = (side?: { available: boolean; reason?: string }) =>
    !!side && !side.available && (side.reason === 'NOT_BUILT' || side.reason === 'FAILED');
  const apiTabHasContent =
    !!apiDiffResult &&
    (apiDiffResult.hasChanges ||
      (apiDiffResult.unresolvedExports?.length ?? 0) > 0 ||
      apiExtractionGap(apiDiffResult.base) ||
      apiExtractionGap(apiDiffResult.compare));

  // Single stability gate. `componentCompare.loading` is true while the base/compare *models* are
  // still being fetched; `dataLoading` is true while the bulk code/aspect/test diff is in flight;
  // `apiDiffLoading` while the API diff (which gates the API tab) resolves. We must not derive any
  // per-view counts until ALL are settled — otherwise a half-loaded state (base model not yet
  // present) reads as "no base → new → everything changed", or the API tab flickers in late.
  const loading = (componentCompare?.loading ?? false) || dataLoading || (!!apiTab && apiDiffLoading);

  // All per-view derivation happens here, and ONLY in the stable branch. While anything is loading we
  // render a skeleton (below) instead of the toolbar, so we compute nothing — no counting, and most
  // importantly no dependency diff against half-loaded or absent data.
  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    if (loading) return acc;

    // Dependency changes come from the dependency-resolver aspect on each descriptor (the same source
    // InlineDepsCompare diffs) — there is no precomputed deps diff in the bulk gql result.
    const getDeps = (descriptor: any): any[] => {
      const aspect = descriptor?.get?.('teambit.dependencies/dependency-resolver');
      return aspect?.data?.dependencies || aspect?.dependencies || [];
    };
    const depChanges = computeDepsDiff(
      isNew ? [] : getDeps(componentCompare?.base?.descriptor),
      getDeps(componentCompare?.compare?.descriptor)
    ).filter((e) => e.status !== 'unchanged').length;

    // Compositions live on the component model (not the bulk diff). Show preview if either side has any.
    const compositionsCount = Math.max(
      componentCompare?.compare?.model?.compositions?.length || 0,
      componentCompare?.base?.model?.compositions?.length || 0
    );

    const changedCode = data ? (data.code || []).filter((f) => f.status && f.status !== 'UNCHANGED').length : 0;
    const changedAspects = data ? (data.aspects || []).length : 0;
    const changedTests = data ? (data.tests || []).filter((f) => f.status && f.status !== 'UNCHANGED').length : 0;

    for (const id of registeredModeIds) {
      switch (id) {
        case 'code':
          acc.code = isNew ? 1 : changedCode;
          break;
        case 'config':
          acc.config = isNew ? 1 : changedAspects;
          break;
        case 'tests':
          acc.tests = isNew ? 0 : changedTests;
          break;
        case 'preview':
          acc.preview = compositionsCount;
          break;
        case 'dependencies':
          acc.dependencies = depChanges;
          break;
        case 'api':
          // Show when there are real changes, unresolved exports, OR a per-version schema gap
          // (so "schema unavailable for this version" is surfaced, not silently hidden). Stays
          // hidden for a plain computed no-op and for non-API components.
          acc.api = apiTabHasContent ? 1 : 0;
          break;
        default:
          acc[id] = 1;
      }
    }
    return acc;
  }, [loading, registeredModeIds, isNew, data, componentCompare, apiTabHasContent]);

  // If the active view has no content, fall back to the first view that does.
  useEffect(() => {
    if (loading) return;
    if ((counts[viewMode] ?? 0) === 0) {
      const first = COMPARE_VIEW_MODES.find((v) => (counts[v.id] ?? 0) > 0);
      if (first) setViewMode(first.id as ViewMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, viewMode, loading]);

  // Render a skeleton until base, compare and the bulk diff are all loaded. We must not render the
  // toolbar early: its visible view modes are derived from the counts, so a half-loaded state would
  // show the wrong set (e.g. 5 modes) and then visibly collapse (to 2) once data arrives.
  if (loading) {
    return <CompareViewSkeleton />;
  }

  return (
    <DiffModeProvider mode={diffMode}>
      <DepsFilterProvider showAll={showAllDeps}>
        <CompareToolbar
          viewMode={viewMode}
          onViewModeChange={(v) => setViewMode(v as ViewMode)}
          endActions={
            <CompareToolbarActions
              viewMode={viewMode}
              diffMode={diffMode}
              onDiffModeChange={setDiffMode}
              depsShowAll={showAllDeps}
              onDepsShowAllChange={setShowAllDeps}
            />
          }
          viewModes={COMPARE_VIEW_MODES}
          counts={counts}
          showCounts={false}
          loading={loading}
        />

        <div className={styles.diffPane} data-view-mode={viewMode}>
          <InlineComponentCompare
            name={name}
            baseId={baseId}
            compareId={compareId}
            baseVersion={baseVersionShort}
            compareVersion={compareVersionShort}
            allTabs={resolvedTabs}
            host={host}
            // Hand the inner context our already-resolved pair: base = the scope's published snap,
            // compare = the live workspace component (with local changes). Without this the inner
            // context re-fetches by id and, in local-changes mode (compareId === baseId), would load
            // the same snap for both sides — making the deps/config/preview tabs show base vs base.
            baseOverride={componentCompare?.base as { model?: any; descriptor?: any } | undefined}
            compareOverride={componentCompare?.compare as { model?: any; descriptor?: any } | undefined}
          >
            {/* The API view isn't an inline tab — render it inside the inline context (so it sees the
              resolved base/compare pair) only while it's the active view, so its diff query fires
              on-demand. CSS hides the inline `[data-tab-id]` panels when `data-view-mode='api'`. */}
            {viewMode === 'api' ? apiTab : null}
          </InlineComponentCompare>
        </div>
      </DepsFilterProvider>
    </DiffModeProvider>
  );
}

function CompareViewSkeleton() {
  return (
    <>
      <div className={styles.toolbarSkeleton}>
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} className={styles.skelPill} />
        ))}
      </div>
      <div className={styles.diffPane}>
        <div className={styles.bodySkeleton}>
          <div className={styles.skelHeader} />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={styles.skelLine} style={{ width: `${45 + ((i * 7) % 45)}%` }} />
          ))}
        </div>
      </div>
    </>
  );
}

function inlineTabIdToViewMode(id?: string): ViewMode | undefined {
  switch (id) {
    case 'inline-code':
      return 'code';
    case 'inline-preview':
      return 'preview';
    case 'inline-docs':
      return 'docs';
    case 'inline-deps':
      return 'dependencies';
    case 'inline-tests':
      return 'tests';
    case 'inline-config':
      return 'config';
    default:
      return undefined;
  }
}
