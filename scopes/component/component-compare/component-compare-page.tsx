import type { HTMLAttributes } from 'react';
import React, { useContext, useEffect, useMemo, useState } from 'react';
import classnames from 'classnames';
import { useSearchParams } from 'react-router-dom';
import { useLocation } from '@teambit/base-react.navigation.link';
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
  DiffModeProvider,
  FileRegistryProvider,
  InlineComponentCompare,
  RegistryFeeder,
  useCompareData,
} from '@teambit/component.ui.component-compare.component-compare';
import type { CompareViewMode, ComponentComparePair } from '@teambit/component.ui.component-compare.component-compare';

import styles from './component-compare-page.module.scss';

export type ComponentComparePageProps = {
  host: string;
  tabs: TabItem[] | (() => TabItem[]);
  className?: string;
} & HTMLAttributes<HTMLDivElement>;

type ViewMode = 'code' | 'preview' | 'docs' | 'dependencies' | 'tests' | 'config';
type DiffMode = 'split' | 'unified';

// The single-component compare offers the same view modes as lane-compare. Which ones actually
// appear is driven by real per-view content counts (see `CompareView`) — mirroring how the cloud
// changes view derives available views from each component's change types, so a user never lands
// on a view that has nothing to show.
const COMPARE_VIEW_MODES: CompareViewMode[] = [
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

export function ComponentComparePage({ host: hostFromProps, tabs, className, ...rest }: ComponentComparePageProps) {
  // `component` from ComponentContext is authoritative for the compare side — mirrors legacy
  // `ComponentCompare` which never loaded a separate compareModel when there was no override.
  // Loading a separate copy via useComponent risks an id string that differs from the live
  // workspace component (e.g. no version), which breaks the server's local-changes detection
  // (`computeCompare`: `comparingWithLocalChanges = workspace && baseId === compareId`).
  const component = useContext(ComponentContext);
  const componentDescriptor = useContext(ComponentDescriptorContext);
  const location = useLocation();

  const resolvedTabs = useMemo(() => (typeof tabs === 'function' ? tabs() : tabs), [tabs]);

  const baseVersion = useCompareQueryParam('baseVersion');
  const isWorkspace = hostFromProps === 'teambit.workspace/workspace';

  const allVersionInfo = useMemo(
    () => component.logs?.slice().sort(sortByDateDsc) || [],
    [component.id.toString(), component.logs?.length]
  );
  const isNew = allVersionInfo.length === 0;
  const compareHasLocalChanges = isWorkspace && !isNew && !location?.search.includes('version');

  // Pick the base version: explicit URL param > previous published version > current.
  // For local-changes mode the base is the latest published snap (so the live workspace files
  // are diffed against it).
  const lastVersionInfo = useMemo(() => {
    if (compareHasLocalChanges) return allVersionInfo[0];
    return allVersionInfo.find(findPrevVersionFromCurrent(component.id.version));
  }, [allVersionInfo, compareHasLocalChanges, component.id.version]);

  const baseId = useMemo(
    () =>
      (baseVersion && component.id.changeVersion(baseVersion)) ||
      (lastVersionInfo && component.id.changeVersion(lastVersionInfo.tag || lastVersionInfo.hash)) ||
      component.id,
    [baseVersion, lastVersionInfo?.tag, lastVersionInfo?.hash, component.id.toString()]
  );

  const { component: base, componentDescriptor: baseComponentDescriptor } = useComponent(
    'teambit.scope/scope',
    baseId?.toString(),
    { skip: !baseId || isNew }
  );

  // For the bulk compare pair we need `baseId === compareId` to trigger the server's
  // local-changes branch in workspace mode. For non-local (explicit version param), they
  // genuinely differ.
  const baseIdStr = baseId?.toString();
  const compareIdStr = compareHasLocalChanges ? baseIdStr : component.id.toString();

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
      loading: false,
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
    ]
  );

  const pair: ComponentComparePair | null = useMemo(() => {
    if (isNew || isSameVersion || !baseIdStr || !compareIdStr) return null;
    return { baseId: baseIdStr, compareId: compareIdStr };
  }, [isNew, isSameVersion, baseIdStr, compareIdStr]);
  const pairs = useMemo(() => (pair ? [pair] : []), [pair]);

  // Map the registered inline tabs to view-mode ids so `CompareView` only counts/shows modes that
  // are actually registered (e.g. there is no `docs` inline tab today).
  const registeredModeIds = useMemo(
    () => resolvedTabs.map((t) => inlineTabIdToViewMode(t.id)).filter(Boolean) as ViewMode[],
    [resolvedTabs]
  );

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
  host,
}: CompareViewProps) {
  const [searchParams] = useSearchParams();
  const [viewMode, setViewModeState] = useState<ViewMode>((searchParams.get('view') as ViewMode) || 'code');
  const [diffMode, setDiffModeState] = useState<DiffMode>((searchParams.get('diffMode') as DiffMode) || 'split');

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

  // Compositions live on the component model (not the bulk diff), so preview availability is known
  // without waiting for the compare query. Show preview if either side has any composition.
  const compositionsCount = Math.max(
    componentCompare?.compare?.model?.compositions?.length || 0,
    componentCompare?.base?.model?.compositions?.length || 0
  );

  const counts = useMemo(() => {
    // `data` is undefined while the bulk compare query loads and null if the pair failed; for the
    // new-component path there is no pair at all (compositions/code come from `useCode`). While
    // loading we keep data-driven views visible (1) to avoid the toolbar flickering; once loaded,
    // the real count of 0 hides an empty view.
    const dataCount = (real: number | undefined, newDefault: number) => {
      if (isNew) return newDefault;
      if (real === undefined) return dataLoading ? 1 : 0;
      return real;
    };
    const changedCode = data ? (data.code || []).filter((f) => f.status && f.status !== 'UNCHANGED').length : undefined;
    const changedAspects = data ? (data.aspects || []).length : undefined;
    const changedTests = data
      ? (data.tests || []).filter((f) => f.status && f.status !== 'UNCHANGED').length
      : undefined;

    const acc: Record<string, number> = {};
    for (const id of registeredModeIds) {
      switch (id) {
        case 'code':
          acc.code = dataCount(changedCode, 1);
          break;
        case 'config':
          acc.config = dataCount(changedAspects, 1);
          break;
        case 'tests':
          acc.tests = dataCount(changedTests, 0);
          break;
        case 'preview':
          acc.preview = compositionsCount;
          break;
        case 'dependencies':
          // the dependencies view renders the full dependency table (incl. unchanged), so it always
          // has something to show — keep it available.
          acc.dependencies = 1;
          break;
        default:
          acc[id] = 1;
      }
    }
    return acc;
  }, [registeredModeIds, isNew, dataLoading, data, compositionsCount]);

  // If the active view has no content, fall back to the first view that does.
  useEffect(() => {
    if ((counts[viewMode] ?? 0) === 0) {
      const first = COMPARE_VIEW_MODES.find((v) => (counts[v.id] ?? 0) > 0);
      if (first) setViewModeState(first.id as ViewMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, viewMode]);

  return (
    <DiffModeProvider mode={diffMode}>
      <CompareToolbar
        viewMode={viewMode}
        onViewModeChange={(v) => setViewMode(v as ViewMode)}
        diffMode={diffMode}
        onDiffModeChange={setDiffMode}
        viewModes={COMPARE_VIEW_MODES}
        counts={counts}
        loading={dataLoading}
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
        />
      </div>
    </DiffModeProvider>
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
