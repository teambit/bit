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
  CompareSidebar,
  FileRegistryProvider,
  useFileRegistry,
  DiffModeProvider,
} from '@teambit/component.ui.component-compare.component-compare';
import type {
  CompareViewMode,
  CompareGroupByOption,
  CompareSidebarGroup,
} from '@teambit/component.ui.component-compare.component-compare';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { useLaneComponents } from '@teambit/lanes.hooks.use-lane-components';
import { ApiDiffFullView } from '@teambit/semantics.ui.api-diff-view';
import type { ComponentDiffEntry } from '@teambit/semantics.ui.api-diff-view';
import { ChangeType } from '@teambit/lanes.entities.lane-diff';
import type { LaneCompareContextModel } from './lane-compare.context';
import { useLaneCompareContext } from './lane-compare.context';
import { LaneCompareProvider } from './lane-compare.provider';
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

function _getChangeTags(changes: ChangeType[], changeType?: ChangeType) {
  const tags: Array<{ label: string; color: string }> = [];
  if (changes.includes(ChangeType.SOURCE_CODE) || changes.includes(ChangeType.NEW) || changeType === ChangeType.NEW)
    tags.push({ label: 'Code', color: 'var(--bit-accent-color, #6c5ce7)' });
  if (changes.includes(ChangeType.DEPENDENCY))
    tags.push({ label: 'Dependencies', color: 'var(--warning-color, #d6a022)' });
  if (changeType === ChangeType.NEW) tags.push({ label: 'New', color: 'var(--positive-color, #37b26c)' });
  return tags;
}

// ── Main Component ──────────────────────────────────────────────────────────

function LaneCompareInline({
  base: _base,
  compare,
  className,
  host: _host,
  tabs: _tabs,
  customUseComponent: _customUseComponent,
  customUseLaneDiff: _customUseLaneDiff,
  LaneCompareLoader: _LaneCompareLoader,
  ComponentCompareLoader: _ComponentCompareLoader,
  onStateChanged: _onStateChanged,
  groupBy: _groupByProp,
  envIcons,
  ...rest
}: LaneCompareProps) {
  const {
    loadingLaneDiff,
    componentsToDiff,
    laneComponentDiffByCompId,
    groupBy: _contextGroupBy,
  } = useLaneCompareContext() as LaneCompareContextModel;

  const resolvedTabs = useMemo(() => {
    if (!_tabs) return [];
    return typeof _tabs === 'function' ? _tabs() : _tabs;
  }, [_tabs]);

  // __bit's useLaneComponents keys on LaneId; hash-based invalidation is not needed here.
  const { components: laneComponents, componentDescriptors: laneComponentDescriptors } = useLaneComponents(compare?.id);
  const compositionsMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!laneComponentDescriptors) return map;
    for (const comp of laneComponentDescriptors) {
      const aspect = comp.get<any>('teambit.compositions/compositions');
      const compositions = aspect?.data?.compositions;
      map.set(comp.id.toStringWithoutVersion(), Array.isArray(compositions) && compositions.length > 0);
    }
    return map;
  }, [laneComponents?.length]);

  const [searchParams] = useSearchParams();
  const [viewMode, setViewModeState] = useState<ViewMode>((searchParams.get('view') as ViewMode) || 'code');
  const [groupBy, setGroupByState] = useState<GroupBy>((searchParams.get('groupBy') as GroupBy) || 'scope');
  const [diffMode, setDiffModeState] = useState<'split' | 'unified'>((searchParams.get('diffMode') as any) || 'split');
  const [selectedId, setSelectedIdState] = useState<string | undefined>(searchParams.get('componentId') || undefined);
  const [selectedFile, setSelectedFileState] = useState<string | undefined>(searchParams.get('file') || undefined);
  const [selectedSearchComponents, setSelectedSearchComponents] = useState<{ value: string; payload: string }[]>([]);
  const diffPaneRef = useRef<HTMLDivElement>(null);
  const fileRegistry = useFileRegistry();

  const syncUrl = useCallback((key: string, value: string | undefined) => {
    const url = new URL(window.location.href);
    value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    window.history.replaceState(null, '', url.toString());
  }, []);

  const setViewMode = useCallback(
    (v: ViewMode) => {
      setViewModeState(v);
      syncUrl('view', v === 'code' ? undefined : v);
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
        return {
          idStr,
          name: compareId?.fullName || baseId?.fullName || idStr,
          baseId: baseId?.toString(),
          compareId: compareId?.toString() || '',
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

  const componentOptions = useMemo(
    () => allComponents.map((c) => ({ value: c.name, payload: c.idStr })),
    [allComponents]
  );

  // Filter
  const filteredComponents = useMemo(() => {
    let result = allComponents;
    if (selectedSearchComponents.length > 0) {
      const selectedIds = new Set(selectedSearchComponents.map((c) => c.payload));
      result = result.filter((c) => selectedIds.has(c.idStr));
    }
    if (viewMode === 'code') {
      result = result.filter(
        (c) =>
          c.changes.some((ch) => ch === ChangeType.SOURCE_CODE || ch === ChangeType.NEW) ||
          c.changeType === ChangeType.NEW
      );
    } else if (viewMode === 'preview') {
      result = result.filter((c) => compositionsMap.get(c.idStr) !== false);
    } else if (viewMode === 'dependencies') {
      result = result.filter((c) => c.changes.some((ch) => ch === ChangeType.DEPENDENCY));
    } else if (viewMode === 'config') {
      result = result.filter((c) => c.changes.some((ch) => ch === ChangeType.ASPECTS));
    }
    return result;
  }, [allComponents, viewMode, selectedSearchComponents, compositionsMap]);

  // Group
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filteredComponents>();
    for (const comp of filteredComponents) {
      const key =
        groupBy === 'status'
          ? comp.changeType || 'unknown'
          : groupBy === 'namespace'
            ? comp.namespace || 'root'
            : groupBy === 'scope'
              ? comp.scope
              : 'all';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(comp);
    }
    return [...groups.entries()].sort(([a], [b]) =>
      groupBy === 'status'
        ? ChangeTypeGroupOrder.indexOf(a as ChangeType) - ChangeTypeGroupOrder.indexOf(b as ChangeType)
        : a.localeCompare(b)
    );
  }, [filteredComponents, groupBy]);

  // Counts
  const counts = useMemo(() => {
    return {
      code: allComponents.filter(
        (c) =>
          c.changes.some((ch) => ch === ChangeType.SOURCE_CODE || ch === ChangeType.NEW) ||
          c.changeType === ChangeType.NEW
      ).length,
      preview: allComponents.filter((c) => compositionsMap.get(c.idStr) !== false).length,
      docs: allComponents.length,
      dependencies: allComponents.filter((c) => c.changes.some((ch) => ch === ChangeType.DEPENDENCY)).length,
      tests: allComponents.length,
      config: allComponents.filter((c) => c.changes.some((ch) => ch === ChangeType.ASPECTS)).length,
      api: allComponents.filter((c) => c.baseId && c.compareId).length,
    };
  }, [allComponents, compositionsMap]);

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

  const sidebarGroups: CompareSidebarGroup[] = useMemo(
    () =>
      grouped.map(([key, comps]) => ({
        key,
        label: groupBy === 'status' ? displayChangeType(key as ChangeType) : key,
        items: comps.map((c) => ({
          id: c.idStr,
          name: c.name,
          envIcon: envIcons?.get(c.idStr),
          status: c.changeType,
          files:
            viewMode === 'code'
              ? fileRegistry?.getFiles(c.idStr)
              : viewMode === 'config'
                ? fileRegistry?.getAspectFiles(c.idStr)
                : undefined,
        })),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grouped, groupBy, envIcons, fileRegistry?.getVersion(), viewMode]
  );

  const apiDiffs: ComponentDiffEntry[] = useMemo(() => {
    const result: ComponentDiffEntry[] = [];
    laneComponentDiffByCompId.forEach((diff: any) => {
      if (diff.sourceHead && diff.targetHead) {
        result.push({ componentId: diff.componentId, sourceHead: diff.sourceHead, targetHead: diff.targetHead });
      }
    });
    return result;
  }, [laneComponentDiffByCompId]);

  const isFullPaneView = viewMode === 'api';

  useEffect(() => {
    if (!loadingLaneDiff && counts[viewMode] === 0) {
      const first = compareViewModes.find((v) => (counts[v.id] ?? 0) > 0);
      if (first) setViewMode(first.id as ViewMode);
    }
  }, [counts, viewMode, loadingLaneDiff]);

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

  return (
    <div {...rest} className={classnames(styles.rootLaneCompare, className)}>
      {/* Toolbar */}
      <CompareToolbar
        viewMode={viewMode}
        onViewModeChange={(v) => setViewMode(v as ViewMode)}
        groupBy={groupBy}
        onGroupByChange={(g) => setGroupBy(g as GroupBy)}
        diffMode={diffMode}
        onDiffModeChange={setDiffMode}
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
          defaultExpandFiles={viewMode === 'code' || viewMode === 'config'}
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
          <ApiDiffFullView diffs={apiDiffs} />
        </div>

        {/* Per-component diff pane */}
        <DiffModeProvider mode={diffMode}>
          <div
            ref={isFullPaneView ? undefined : diffPaneRef}
            className={styles.diffPane}
            data-view-mode={viewMode}
            style={isFullPaneView ? { display: 'none' } : undefined}
          >
            {grouped.map(([key, comps]) => (
              <div key={key} className={styles.laneCompareGroup}>
                {groupBy !== 'none' && (
                  <div className={styles.laneCompareGroupHeader}>
                    <span className={styles.laneCompareGroupLabel}>
                      {groupBy === 'status' ? displayChangeType(key as ChangeType) : key}
                    </span>
                    <span className={styles.laneCompareGroupCount}>{comps.length}</span>
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
                    envIcon={envIcons?.get(c.idStr)}
                    allTabs={resolvedTabs}
                    accentColor={ACCENT_COLORS[c.changeType] || undefined}
                    host="teambit.scope/scope"
                  />
                ))}
              </div>
            ))}
            {filteredComponents.length === 0 && (
              <div className={styles.emptyState}>No components match the current filters</div>
            )}
          </div>
        </DiffModeProvider>
      </div>
    </div>
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
