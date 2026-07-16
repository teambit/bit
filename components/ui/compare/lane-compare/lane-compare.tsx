import type { HTMLAttributes } from 'react';
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import classnames from 'classnames';
import type { UseComponentType } from '@teambit/component';
import type { MaybeLazyLoaded } from '@teambit/component.ui.component-compare.utils.lazy-loading';
import type { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import type { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import type { UseLaneDiffStatus } from '@teambit/lanes.ui.compare.lane-compare-hooks.use-lane-diff-status';
import {
  InlineComponentCompare,
  CompareToolbar,
  CompareToolbarActions,
  CompareSidebar,
  FileRegistryProvider,
  useFileRegistry,
  DiffModeProvider,
  DepsFilterProvider,
  CompareDataProvider,
  RegistryFeeder,
} from '@teambit/component.ui.component-compare.component-compare';
import type {
  CompareViewMode,
  CompareGroupByOption,
  CompareSidebarGroup,
  ComponentComparePair,
} from '@teambit/component.ui.component-compare.component-compare';
import { InlineCompareEmpty } from '@teambit/component.ui.component-compare.context';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { useLaneComponents } from '@teambit/lanes.hooks.use-lane-components';
import { ApiDiffLaneView } from '@teambit/semantics.ui.api-diff-view';
import type { ComponentDiffEntry, ApiDiffInsight, ApiEntry } from '@teambit/semantics.ui.api-diff-view';
import { ChangeType } from '@teambit/lanes.entities.lane-diff';
import type { LaneCompareContextModel } from './lane-compare.context';
import { useLaneCompareContext } from './lane-compare.context';
import { LaneCompareProvider } from './lane-compare.provider';
import { BaseSourceIndicator } from './base-source-indicator';
import { ChangeTypeGroupOrder } from './lane-compare.models';
import { displayChangeType } from './lane-compare.utils';

import styles from './lane-compare.module.scss';

// ── Types ───────────────────────────────────────────────────────────────────

export type LaneCompareProps = {
  base: LaneModel;
  compare: LaneModel;
  host: string;
  tabs?: MaybeLazyLoaded<TabItem[]>;
  customUseComponent?: UseComponentType;
  customUseLaneDiff?: UseLaneDiffStatus;
  LaneCompareLoader?: React.ComponentType;
  ComponentCompareLoader?: React.ComponentType;
  onStateChanged?: any;
  groupBy?: 'scope' | 'status';
  envIcons?: Map<string, string>;
  /** slot-contributed API diff insight renderers (from componentCompareUI.registerApiDiffInsight) */
  apiDiffInsights?: ApiDiffInsight[];
} & HTMLAttributes<HTMLDivElement>;

type ViewMode = 'code' | 'preview' | 'docs' | 'dependencies' | 'tests' | 'config' | 'api';
type GroupBy = 'scope' | 'namespace' | 'status' | 'none';

function scrollInPane(pane: HTMLDivElement, el: Element) {
  const elRect = el.getBoundingClientRect();
  const paneRect = pane.getBoundingClientRect();
  pane.scrollTo({ top: elRect.top - paneRect.top + pane.scrollTop, behavior: 'instant' });
}

function waitForElementInPane(pane: HTMLDivElement, selector: string, timeoutMs = 5000): Promise<Element | null> {
  const existing = pane.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const el = pane.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(pane, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

function scrollToElement(pane: HTMLDivElement | null, id: string, fileName?: string) {
  if (!pane) return;

  if (!fileName) {
    waitForElementInPane(pane, `[data-component-id="${CSS.escape(id)}"]`).then((el) => {
      if (el) scrollInPane(pane, el);
    });
    return;
  }

  const fileSelector = `[data-file-id="${CSS.escape(id)}:${CSS.escape(fileName)}"]`;
  const existingFile = pane.querySelector(fileSelector);
  if (existingFile) {
    requestAnimationFrame(() => scrollInPane(pane, existingFile));
    return;
  }

  // File not rendered yet — scroll to component first to trigger lazy loading, then wait for the file
  const compEl = pane.querySelector(`[data-component-id="${CSS.escape(id)}"]`);
  if (compEl) {
    scrollInPane(pane, compEl);
  }
  waitForElementInPane(pane, fileSelector).then((el) => {
    if (el) scrollInPane(pane, el);
  });
}

const ACCENT_COLORS: Record<string, string> = {
  [ChangeType.NEW]: 'var(--positive-color, #37b26c)',
  [ChangeType.SOURCE_CODE]: 'var(--bit-accent-color, #6c5ce7)',
  [ChangeType.DEPENDENCY]: 'var(--warning-color, #d6a022)',
};

/**
 * Whether a component actually changed between base and compare — any change type other than NONE
 * (NEW / SOURCE_CODE / DEPENDENCY / ASPECTS / API). Used by the docs and preview views, which have no
 * per-view diff signal of their own, so they show only modified components rather than every one.
 */
function isModified(changeType?: ChangeType, changes: ChangeType[] = []): boolean {
  return changes.some((ch) => ch !== ChangeType.NONE) || (changeType != null && changeType !== ChangeType.NONE);
}

// ── Blank state ─────────────────────────────────────────────────────────────

/**
 * full-page state for a comparison with no changes at all. rendering the regular compare chrome
 * (toolbar, tab counts, group-by, sidebar) around an empty pane reads as a broken page, so the
 * whole body collapses into this single hero instead. `released` distinguishes "the target already
 * contains everything on this lane" (it moved ahead by absorbing it) from two identical lanes.
 */
function LaneCompareBlankState({
  sourceLane,
  targetLane,
  componentCount,
  released,
}: {
  sourceLane: string;
  targetLane: string;
  componentCount: number;
  released: boolean;
}) {
  const title = released ? `This lane has been released to ${targetLane}` : 'No changes to compare';
  const subtitle =
    componentCount === 0
      ? 'Both lanes point to the same components.'
      : released
        ? `${targetLane} already includes all ${componentCount} components from ${sourceLane} — there's nothing left to compare.`
        : `${sourceLane} and ${targetLane} point to the same versions across ${componentCount} components.`;
  return (
    <div className={styles.blankState} role="status">
      <div className={styles.blankStateIcon} aria-hidden="true">
        ✓
      </div>
      <div className={styles.blankStateTitle}>{title}</div>
      <div className={styles.blankStateSubtitle}>{subtitle}</div>
      {componentCount > 0 && (
        <div className={styles.blankStateMeta}>
          {componentCount} component{componentCount !== 1 ? 's' : ''} · up to date with {targetLane}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

function LaneCompareInline({
  base: _base,
  compare,
  className,
  host,
  tabs: _tabs,
  customUseComponent: _customUseComponent,
  customUseLaneDiff: _customUseLaneDiff,
  LaneCompareLoader: _LaneCompareLoader,
  ComponentCompareLoader: _ComponentCompareLoader,
  onStateChanged: _onStateChanged,
  groupBy: _groupByProp,
  envIcons,
  apiDiffInsights,
  ...rest
}: LaneCompareProps) {
  const { loadingLaneDiff, componentsToDiff, laneComponentDiffByCompId } =
    useLaneCompareContext() as LaneCompareContextModel;

  const resolvedTabs = useMemo(() => {
    if (!_tabs) return [];
    return typeof _tabs === 'function' ? _tabs() : _tabs;
  }, [_tabs]);

  // __bit's useLaneComponents keys on LaneId; hash-based invalidation is not needed here.
  const { componentDescriptors: laneComponentDescriptors } = useLaneComponents(compare?.id);
  const compositionsMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!laneComponentDescriptors) return map;
    laneComponentDescriptors.forEach((comp) => {
      const aspect = comp.get<any>('teambit.compositions/compositions');
      const compositions = aspect?.data?.compositions;
      map.set(comp.id.toStringWithoutVersion(), Array.isArray(compositions) && compositions.length > 0);
    });
    return map;
    // depend on the descriptors themselves (like envIconsMap), not the component count — switching to a
    // different lane with the same number of components changes the descriptors but not the length, and
    // keying on length alone would keep the previous lane's composition data (wrong Preview visibility).
  }, [laneComponentDescriptors]);
  // Build the env-icon lookup from the descriptors we already loaded. Falls back to the explicit
  // `envIcons` prop if the parent supplies it (e.g. for testing/storybook).
  //
  // `AspectList.get(aspectId)` returns the aspect *data* directly (not a `{ data }` wrapper),
  // so the icon lives at `.icon`. Some envs also surface the icon nested under the env-descriptor
  // object, so we check both shapes to be defensive.
  const envIconsMap = useMemo(() => {
    const map = new Map<string, string>(envIcons ?? []);
    if (!laneComponentDescriptors) return map;
    laneComponentDescriptors.forEach((comp) => {
      const envAspect = comp.get<any>('teambit.envs/envs');
      const icon =
        envAspect?.icon || envAspect?.data?.icon || envAspect?.descriptor?.icon || envAspect?.env?.icon || undefined;
      if (!icon) return;
      const key = comp.id.toStringWithoutVersion();
      if (!map.has(key)) map.set(key, icon);
    });
    return map;
  }, [laneComponentDescriptors, envIcons]);

  const [searchParams] = useSearchParams();
  const [viewMode, setViewModeState] = useState<ViewMode>((searchParams.get('view') as ViewMode) || 'code');
  const [groupBy, setGroupByState] = useState<GroupBy>((searchParams.get('groupBy') as GroupBy) || 'scope');
  const [diffMode, setDiffModeState] = useState<'split' | 'unified'>((searchParams.get('diffMode') as any) || 'split');
  // global "show all dependencies" toggle for the deps view (changed-only by default), lifted here so a
  // single toolbar control drives every deps panel via DepsFilterProvider.
  const [showAllDeps, setShowAllDeps] = useState(false);
  const [selectedId, setSelectedIdState] = useState<string | undefined>(searchParams.get('componentId') || undefined);
  const [selectedFile, setSelectedFileState] = useState<string | undefined>(searchParams.get('file') || undefined);
  const [selectedSearchComponents, setSelectedSearchComponents] = useState<{ value: string; payload: string }[]>([]);
  const diffPaneRef = useRef<HTMLDivElement>(null);
  const fileRegistry = useFileRegistry();

  const syncUrl = useCallback((key: string, value: string | undefined) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.history.replaceState(null, '', url.toString());
  }, []);

  const setViewMode = useCallback(
    (v: ViewMode) => {
      setViewModeState(v);
      syncUrl('view', v === 'code' ? undefined : v);
      // file/export selection is per-view (code files vs API exports share this state) —
      // carrying it across modes would focus an unrelated item with the same name.
      setSelectedFileState(undefined);
      syncUrl('file', undefined);
    },
    [syncUrl]
  );
  const setGroupBy = useCallback(
    (g: GroupBy) => {
      setGroupByState(g);
      syncUrl('groupBy', g === 'scope' ? undefined : g);
    },
    [syncUrl]
  );
  const setDiffMode = useCallback(
    (d: 'split' | 'unified') => {
      setDiffModeState(d);
      syncUrl('diffMode', d === 'split' ? undefined : d);
    },
    [syncUrl]
  );
  const setSelectedId = useCallback(
    (id: string | undefined) => {
      setSelectedIdState(id);
      syncUrl('componentId', id || undefined);
    },
    [syncUrl]
  );
  const setSelectedFile = useCallback(
    (f: string | undefined) => {
      setSelectedFileState(f);
      syncUrl('file', f || undefined);
    },
    [syncUrl]
  );

  // Scroll to selected component on initial page load from URL
  const initialScrollDone = useRef(false);
  useEffect(() => {
    if (initialScrollDone.current || !selectedId || loadingLaneDiff) return;
    initialScrollDone.current = true;
    scrollToElement(diffPaneRef.current, selectedId, selectedFile);
  }, [selectedId, selectedFile, loadingLaneDiff]);

  // Build component list
  const allComponents = useMemo(
    () =>
      (componentsToDiff || []).map(([baseId, compareId]) => {
        const idStr = compareId?.toStringWithoutVersion() || baseId?.toStringWithoutVersion() || '';
        const diff = laneComponentDiffByCompId.get(idStr);
        const changes: ChangeType[] = (diff as any)?.changes || [];
        const changeType: ChangeType = (diff as any)?.changeType;
        const baseSource: 'workspace' | 'scope' | undefined = (diff as any)?.baseSource;
        return {
          idStr,
          name: compareId?.fullName || baseId?.fullName || idStr,
          baseId: baseId?.toString(),
          compareId: compareId?.toString() || '',
          baseSource,
          baseVersion: baseId?.version?.slice(0, 7),
          compareVersion: compareId?.version?.slice(0, 7),
          baseUrl: baseId ? ComponentUrl.toUrl(baseId, { includeVersion: true, useLocationOrigin: true }) : undefined,
          compareUrl: compareId
            ? ComponentUrl.toUrl(compareId, { includeVersion: true, useLocationOrigin: true })
            : undefined,
          changes,
          changeType,
          scope: (compareId || baseId)?.scope || '',
          namespace: (compareId || baseId)?.namespace || '',
        };
      }),
    [componentsToDiff, laneComponentDiffByCompId]
  );

  // pairs for the bulk compare query — only components that have a base (new components use the useCode path).
  const comparePairs = useMemo<ComponentComparePair[]>(
    () =>
      allComponents
        .filter((c) => !!c.baseId && !!c.compareId)
        .map((c) => ({ baseId: c.baseId as string, compareId: c.compareId })),
    [allComponents]
  );

  const componentOptions = useMemo(
    () => allComponents.map((c) => ({ value: c.name, payload: c.idStr })),
    [allComponents]
  );

  // Search filter only — deliberately view-mode-independent. The diff pane renders this full set so
  // that switching view modes never mounts/unmounts panels (which was the 2-4s freeze); per-view
  // visibility is then driven entirely by CSS via the `data-has-*` attributes below.
  const searchFilteredComponents = useMemo(() => {
    if (selectedSearchComponents.length === 0) return allComponents;
    const selectedIds = new Set(selectedSearchComponents.map((c) => c.payload));
    return allComponents.filter((c) => selectedIds.has(c.idStr));
  }, [allComponents, selectedSearchComponents]);

  // Whether a component belongs in the Code view. The lane-diff `changeType` (SOURCE_CODE) is a coarse
  // hint that can disagree with the real bulk file diff — a component can be flagged as a code change yet
  // have zero actually-changed files (metadata-only). Once the bulk data has loaded we trust the real
  // file list (getFiles → [] means "loaded, no code changes" → hide it); until then we fall back to the
  // coarse hint so components paint without waiting. NEW components render all files via a separate path
  // (not the bulk registry), so they always qualify.
  const hasCodeChanges = useCallback(
    (c: (typeof allComponents)[number]) => {
      if (c.changeType === ChangeType.NEW || c.changes.some((ch) => ch === ChangeType.NEW)) return true;
      const files = fileRegistry?.getFiles(c.idStr);
      if (files === undefined) return c.changes.some((ch) => ch === ChangeType.SOURCE_CODE);
      return files.length > 0;
    },
    // getVersion() advances on every registration, so this recomputes as bulk file data streams in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fileRegistry, fileRegistry?.getVersion()]
  );

  // Whether a component belongs in the API view — the API analog of `hasCodeChanges`. The API diff view
  // registers each analyzed component's changed public exports (or an empty list when it has none), so
  // once that's known `getApiEntries` is the authoritative signal: a non-empty list means real changes.
  // Until it's known (undefined) we fall back to the coarse hint — a source or dependency change can
  // move the public API; a new component has no base to diff, so it's excluded — so the sidebar paints
  // while analysis streams in, then settles to the real answer.
  const hasApiChanges = useCallback(
    (c: (typeof allComponents)[number]) => {
      const entries = fileRegistry?.getApiEntries(c.idStr);
      if (entries === undefined)
        return c.changes.some((ch) => ch === ChangeType.SOURCE_CODE || ch === ChangeType.DEPENDENCY);
      return entries.length > 0;
    },
    // getVersion() advances on every registration, so this recomputes as API results stream in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fileRegistry, fileRegistry?.getVersion()]
  );

  const matchesView = useCallback(
    (c: (typeof allComponents)[number], mode: ViewMode) => {
      switch (mode) {
        case 'code':
          return hasCodeChanges(c);
        case 'api':
          return hasApiChanges(c);
        case 'preview':
          // a modified component that actually has compositions to preview.
          return isModified(c.changeType, c.changes) && compositionsMap.get(c.idStr) !== false;
        case 'docs':
          // docs have no dedicated diff signal, so show every modified component.
          return isModified(c.changeType, c.changes);
        case 'dependencies':
          return c.changes.some((ch) => ch === ChangeType.DEPENDENCY);
        case 'config':
          return c.changes.some((ch) => ch === ChangeType.ASPECTS);
        default:
          // tests show every component.
          return true;
      }
    },
    [compositionsMap, hasCodeChanges, hasApiChanges]
  );

  // View-mode-filtered set. Cheap (no heavy mounting) — used for the sidebar, the empty-state check,
  // and the per-group visible counts. NOT used to mount the diff pane panels.
  const filteredComponents = useMemo(
    () => searchFilteredComponents.filter((c) => matchesView(c, viewMode)),
    [searchFilteredComponents, viewMode, matchesView]
  );

  // Stable `data-has-*` attributes per component, derived only from view-mode-independent data so the
  // object refs survive view-mode switches and keep `InlineComponentCompare`'s React.memo intact. CSS
  // (in lane-compare.module.scss, scoped by `[data-view-mode]`) hides panels lacking the active flag.
  const componentDataAttrs = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    allComponents.forEach((c) => {
      const attrs: Record<string, string> = {};
      const modified = isModified(c.changeType, c.changes);
      if (hasCodeChanges(c)) attrs['data-has-code'] = '';
      // docs and preview only surface modified components (preview additionally needs compositions).
      if (modified) attrs['data-has-docs'] = '';
      if (modified && compositionsMap.get(c.idStr) !== false) attrs['data-has-preview'] = '';
      if (c.changes.some((ch) => ch === ChangeType.DEPENDENCY)) attrs['data-has-deps'] = '';
      if (c.changes.some((ch) => ch === ChangeType.ASPECTS)) attrs['data-has-config'] = '';
      map.set(c.idStr, attrs);
    });
    return map;
  }, [allComponents, compositionsMap, hasCodeChanges]);

  // Group helper (view-mode-independent grouping: by scope/namespace/status).
  const groupComponents = useCallback(
    (comps: typeof allComponents) => {
      const keyOf = (comp: (typeof allComponents)[number]): string => {
        if (groupBy === 'status') return comp.changeType || 'unknown';
        if (groupBy === 'namespace') return comp.namespace || 'root';
        if (groupBy === 'scope') return comp.scope;
        return 'all';
      };
      const groups = new Map<string, typeof allComponents>();
      comps.forEach((comp) => {
        const key = keyOf(comp);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(comp);
      });
      return [...groups.entries()].sort(([a], [b]) =>
        groupBy === 'status'
          ? ChangeTypeGroupOrder.indexOf(a as ChangeType) - ChangeTypeGroupOrder.indexOf(b as ChangeType)
          : a.localeCompare(b)
      );
    },
    [groupBy]
  );

  // Sidebar grouping uses the view-filtered set (so the sidebar reflects the active view).
  const grouped = useMemo(() => groupComponents(filteredComponents), [groupComponents, filteredComponents]);

  // Pane grouping uses the search-only set — stable across view-mode switches, so panels never remount.
  const paneGrouped = useMemo(
    () => groupComponents(searchFilteredComponents),
    [groupComponents, searchFilteredComponents]
  );

  // idStrs visible in the active view — drives per-group visible counts and empty-group hiding.
  const visibleIds = useMemo(() => new Set(filteredComponents.map((c) => c.idStr)), [filteredComponents]);

  // Counts
  const counts = useMemo(() => {
    return {
      code: allComponents.filter((c) => hasCodeChanges(c)).length,
      // docs and preview show only modified components (they have no per-view diff signal); the count
      // must match so the tab badge and the auto-view-switch reflect what actually renders.
      preview: allComponents.filter(
        (c) => isModified(c.changeType, c.changes) && compositionsMap.get(c.idStr) !== false
      ).length,
      docs: allComponents.filter((c) => isModified(c.changeType, c.changes)).length,
      dependencies: allComponents.filter((c) => c.changes.some((ch) => ch === ChangeType.DEPENDENCY)).length,
      tests: allComponents.length,
      config: allComponents.filter((c) => c.changes.some((ch) => ch === ChangeType.ASPECTS)).length,
      // API tab count stays the full component set on purpose: a mode with count 0 is hidden by the
      // toolbar, and the API view must stay reachable even when nothing changed (to show its own
      // "stable"/"nothing to compare" states) — the sidebar and pane filter to real diffs via
      // hasApiChanges/hasVisibleDiff, this count only keeps the tab present.
      api: allComponents.length,
    };
  }, [allComponents, compositionsMap, hasCodeChanges]);

  const compareViewModes: CompareViewMode[] = useMemo(
    () => [
      { id: 'api', displayName: 'API', icon: 'schema' },
      { id: 'code', displayName: 'Code', icon: 'code' },
      { id: 'preview', displayName: 'Preview', icon: 'eye' },
      { id: 'docs', displayName: 'Docs', icon: 'overview' },
      { id: 'dependencies', displayName: 'Dependencies', icon: 'link' },
      // { id: 'tests', displayName: 'Tests', icon: 'test' },
      { id: 'config', displayName: 'Config', icon: 'configuration' },
    ],
    []
  );

  const groupByOptions: CompareGroupByOption[] = useMemo(() => {
    const options: CompareGroupByOption[] = [
      { value: 'scope', label: 'Scope' },
      { value: 'namespace', label: 'Namespace' },
    ];
    options.push({ value: 'none', label: 'None' });
    return options;
  }, [viewMode]);

  const sidebarGroups: CompareSidebarGroup[] = useMemo(() => {
    const filesFor = (idStr: string) => {
      if (viewMode === 'code') return fileRegistry?.getFiles(idStr);
      if (viewMode === 'config') return fileRegistry?.getAspectFiles(idStr);
      if (viewMode === 'api') return fileRegistry?.getApiEntries(idStr);
      return undefined;
    };
    return grouped.map(([key, comps]) => ({
      key,
      label: groupBy === 'status' ? displayChangeType(key as ChangeType) : key,
      items: comps.map((c) => ({
        id: c.idStr,
        name: c.name,
        envIcon: envIconsMap.get(c.idStr),
        status: c.changeType,
        files: filesFor(c.idStr),
        // only surface a source indicator when the base had to be pulled from the remote scope.
        sourceIndicator: c.baseSource === 'scope' ? <BaseSourceIndicator compareId={c.compareId} /> : undefined,
      })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, groupBy, envIconsMap, fileRegistry?.getVersion(), viewMode]);

  // every component participates: pairs get diffed (or pre-gated when no API-relevant
  // change types exist), new components render as "no base to compare" rows.
  const apiDiffs: ComponentDiffEntry[] = useMemo(() => {
    const result: ComponentDiffEntry[] = [];
    laneComponentDiffByCompId.forEach((diff: any) => {
      result.push({
        componentId: diff.componentId,
        sourceHead: diff.sourceHead,
        targetHead: diff.targetHead,
        changes: diff.changes,
      });
    });
    return result;
  }, [laneComponentDiffByCompId]);

  const registerApiEntries = useCallback(
    (id: string, entries: ApiEntry[]) => fileRegistry?.registerApiEntries(id, entries),
    [fileRegistry]
  );

  // Distinguish "the lanes are identical / nothing changed" from "your filters hid everything",
  // so an empty comparison no longer reads as a blank pane.
  const emptyState = useMemo(() => {
    if (allComponents.length === 0) {
      return { message: 'No changes between these lanes', hint: 'Both lanes point to the same components.' };
    }
    if (selectedSearchComponents.length > 0) {
      return {
        message: 'No components match the current filters',
        hint: 'Clear the search to see all changed components.',
      };
    }
    const label = compareViewModes.find((v) => v.id === viewMode)?.displayName?.toLowerCase() || viewMode;
    return { message: `No ${label} changes in this comparison`, hint: 'Try a different view above.' };
  }, [allComponents.length, selectedSearchComponents.length, viewMode, compareViewModes]);

  const isFullPaneView = viewMode === 'api';

  useEffect(() => {
    if (!loadingLaneDiff && counts[viewMode] === 0) {
      const first = compareViewModes.find((v) => (counts[v.id] ?? 0) > 0);
      if (first) setViewMode(first.id as ViewMode);
    }
  }, [counts, viewMode, loadingLaneDiff]);

  // No component changed at all (every change list is NONE, or there are no pairs) — the compare has
  // nothing to show in ANY view, so the whole body renders as a single blank state (below) instead of
  // empty chrome. NEW/DELETED components count as changes, so their presence keeps the full view.
  const noChanges = useMemo(
    () => !loadingLaneDiff && allComponents.every((c) => !isModified(c.changeType, c.changes)),
    [loadingLaneDiff, allComponents]
  );

  // with zero changes, a pair that is not up-to-date means the target moved ahead while already
  // containing the lane's snaps — i.e. the lane was released/merged into the target.
  const targetContainsLane = useMemo(() => {
    if (!noChanges) return false;
    let ahead = false;
    laneComponentDiffByCompId.forEach((diff: any) => {
      if (diff?.upToDate === false && !diff?.unrelated) ahead = true;
    });
    return ahead;
  }, [noChanges, laneComponentDiffByCompId]);

  if (loadingLaneDiff) {
    return (
      <div className={classnames(styles.rootLaneCompare, className)}>
        <div className={styles.laneCompareLoading}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={styles.laneCompareSkeleton}>
              <div className={styles.skeletonBar} style={{ width: `${40 + (i % 3) * 20}%` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (noChanges) {
    return (
      <div {...rest} className={classnames(styles.rootLaneCompare, className)}>
        <LaneCompareBlankState
          sourceLane={compare?.id?.name || 'this lane'}
          targetLane={_base?.id?.name || 'main'}
          componentCount={allComponents.length}
          released={targetContainsLane}
        />
      </div>
    );
  }

  return (
    <CompareDataProvider pairs={comparePairs} host={host}>
      <RegistryFeeder pairs={comparePairs} />
      <div {...rest} className={classnames(styles.rootLaneCompare, className)}>
        {/* Toolbar */}
        <CompareToolbar
          viewMode={viewMode}
          onViewModeChange={(v) => setViewMode(v as ViewMode)}
          groupBy={groupBy}
          onGroupByChange={(g) => setGroupBy(g as GroupBy)}
          endActions={
            <CompareToolbarActions
              viewMode={viewMode}
              diffMode={diffMode}
              onDiffModeChange={setDiffMode}
              depsShowAll={showAllDeps}
              onDepsShowAllChange={setShowAllDeps}
            />
          }
          viewModes={compareViewModes}
          groupByOptions={groupByOptions}
          counts={counts}
          loading={loadingLaneDiff}
          componentOptions={componentOptions}
          selectedComponents={selectedSearchComponents}
          onSelectedComponentsChange={setSelectedSearchComponents}
        />

        {/* Layout */}
        <div className={styles.layout}>
          {/* Sidebar */}
          <CompareSidebar
            groups={sidebarGroups}
            selectedId={selectedId}
            selectedFile={selectedFile}
            defaultExpandFiles={viewMode === 'code' || viewMode === 'config' || viewMode === 'api'}
            onSelect={(id, fileName) => {
              setSelectedFile(fileName);
              setSelectedId(selectedId === id && !fileName ? undefined : id || undefined);
              if (id) {
                scrollToElement(diffPaneRef.current, id, fileName);
              }
            }}
            loading={loadingLaneDiff}
          />

          {/* Full-pane view (API) — kept mounted to preserve query cache */}
          <div
            ref={isFullPaneView ? diffPaneRef : undefined}
            className={styles.diffPane}
            style={isFullPaneView ? undefined : { display: 'none' }}
          >
            <ApiDiffLaneView
              diffs={apiDiffs}
              host={host}
              selectedId={selectedId}
              selectedExport={selectedFile}
              insights={apiDiffInsights}
              onApiEntries={registerApiEntries}
              active={isFullPaneView}
            />
          </div>

          {/* Per-component diff pane */}
          <DiffModeProvider mode={diffMode}>
            <DepsFilterProvider showAll={showAllDeps}>
              <div
                ref={isFullPaneView ? undefined : diffPaneRef}
                className={styles.diffPane}
                data-view-mode={viewMode}
                style={isFullPaneView ? { display: 'none' } : undefined}
              >
                {paneGrouped.map(([key, comps]) => {
                  // Count/hide use the active view's visible set; the panels themselves are always
                  // mounted (CSS hides the non-matching ones). An all-hidden group collapses via the
                  // `groupHidden` class — a parent attribute flip that keeps its children mounted.
                  const visibleCount = comps.reduce((n, c) => n + (visibleIds.has(c.idStr) ? 1 : 0), 0);
                  return (
                    <div
                      key={key}
                      className={classnames(styles.laneCompareGroup, visibleCount === 0 && styles.groupHidden)}
                    >
                      {groupBy !== 'none' && (
                        <div className={styles.laneCompareGroupHeader}>
                          <span className={styles.laneCompareGroupLabel}>
                            {groupBy === 'status' ? displayChangeType(key as ChangeType) : key}
                          </span>
                          <span className={styles.laneCompareGroupCount}>{visibleCount}</span>
                        </div>
                      )}
                      {comps.map((c) => (
                        <InlineComponentCompare
                          key={c.idStr}
                          name={c.name}
                          baseId={c.baseId}
                          compareId={c.compareId}
                          baseVersion={c.baseVersion}
                          compareVersion={c.compareVersion}
                          baseUrl={c.baseUrl}
                          compareUrl={c.compareUrl}
                          envIcon={envIconsMap.get(c.idStr)}
                          allTabs={resolvedTabs}
                          accentColor={ACCENT_COLORS[c.changeType] || undefined}
                          host={host}
                          dataAttributes={componentDataAttrs.get(c.idStr)}
                        />
                      ))}
                    </div>
                  );
                })}
                {filteredComponents.length === 0 && (
                  <div className={styles.emptyState}>
                    <InlineCompareEmpty message={emptyState.message} hint={emptyState.hint} />
                  </div>
                )}
              </div>
            </DepsFilterProvider>
          </DiffModeProvider>
        </div>
      </div>
    </CompareDataProvider>
  );
}

// ── Wrapper ─────────────────────────────────────────────────────────────────

const LaneCompareMemoized = React.memo(LaneCompareInline);

export const LaneCompare = React.memo(function LaneCompareWrapper({ ...props }: LaneCompareProps) {
  const laneCompareContext = useLaneCompareContext();
  if (laneCompareContext)
    return (
      <FileRegistryProvider>
        <LaneCompareInline {...props} />
      </FileRegistryProvider>
    );
  if (!props.base?.id || !props.compare?.id) return null;
  return (
    <LaneCompareProvider
      {...{ ...props, base: props.base.id, compare: props.compare.id, useLaneDiffStatus: props.customUseLaneDiff }}
    >
      <FileRegistryProvider>
        <LaneCompareMemoized {...props} />
      </FileRegistryProvider>
    </LaneCompareProvider>
  );
});
