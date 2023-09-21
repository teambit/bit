import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { LaneCompareState, computeStateKey } from '@teambit/lanes.ui.compare.lane-compare-state';
import { ComponentCompareState } from '@teambit/component.ui.component-compare.models.component-compare-state';
import { MaybeLazyLoaded, extractLazyLoadedData } from '@teambit/component.ui.component-compare.utils.lazy-loading';
import { sortTabs } from '@teambit/component.ui.component-compare.utils.sort-tabs';
import { compact, isEqual } from 'lodash';
import { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { LaneId } from '@teambit/lane-id';
import {
  useLaneDiffStatus as defaultUseLaneDiffStatus,
  UseLaneDiffStatus,
} from '@teambit/lanes.ui.compare.lane-compare-hooks.use-lane-diff-status';
import { LaneComponentDiff } from '@teambit/lanes.entities.lane-diff';
import { ComponentID } from '@teambit/component-id';
import { LaneCompareContext, LaneCompareContextModel } from './lane-compare.context';
import { LaneFilter, extractCompsToDiff, filterDepKey } from './lane-compare';

export type LaneCompareGroupBy = 'scope' | 'status';

export type LaneCompareProviderProps = {
  children: ReactNode;
  /**
   * default state of all component compare drawers
   */
  defaultComponentCompareState?: LaneCompareState;
  /**
   * default open drawers - comp ids keys
   */
  defaultOpenDrawers?: string[];
  /**
   * default full screen drawer
   */
  defaultFullScreen?: string;
  /**
   * filters to apply to component diffs
   */
  filters?: Array<LaneFilter>;
  /**
   * filter out component diffs by type
   */
  filter?: (laneComponentDiff?: LaneComponentDiff, filters?: Array<LaneFilter>) => boolean;
  /**
   * group component diffs by diff status or scope
   */
  groupBy?: LaneCompareGroupBy;
  /**
   * hook to override fetching lane diff status for base and compare
   */
  useLaneDiffStatus?: UseLaneDiffStatus;
  base?: LaneId;
  compare?: LaneId;
  tabs?: MaybeLazyLoaded<TabItem[]>;
};

function _LaneCompareProvider({
  defaultComponentCompareState,
  tabs,
  children,
  defaultOpenDrawers,
  defaultFullScreen,
  useLaneDiffStatus = defaultUseLaneDiffStatus,
  base,
  compare,
  filters,
  groupBy,
  filter,
}: LaneCompareProviderProps) {
  const { loading: loadingLaneDiff, laneDiff } = useLaneDiffStatus({
    baseId: base?.toString(),
    compareId: compare?.toString(),
    options: {
      skipUpToDate: true,
    },
  });

  const componentsToDiff = useMemo(
    () => extractCompsToDiff(laneDiff),
    [loadingLaneDiff, base?.toString(), compare?.toString()]
  );

  const defaultLaneState = useCallback(
    (compId?: string) => {
      const _tabs = extractLazyLoadedData(tabs)?.sort(sortTabs);

      const defaultState = (compId && defaultComponentCompareState?.get(compId)) || {};

      const value: ComponentCompareState = {
        tabs: {
          controlled: true,
          id: _tabs && _tabs[0].id,
          element: _tabs && _tabs[0].element,
        },
        code: {
          controlled: true,
        },
        aspects: {
          controlled: true,
        },
        preview: {
          controlled: true,
        },
        versionPicker: {
          element: null,
        },
        ...defaultState,
      };
      return value;
    },
    [defaultComponentCompareState]
  );

  const [laneCompareState, setLaneCompareState] = useState<LaneCompareState>(() => {
    const state = new Map();
    componentsToDiff.forEach(([_base, _compare]) => {
      const key = computeStateKey(_base, _compare);
      const baseKey = computeStateKey(_base);
      const compareKey = computeStateKey(undefined, _compare);
      state.set(key, defaultLaneState(key));
      state.set(baseKey, defaultLaneState(baseKey));
      state.set(compareKey, defaultLaneState(compareKey));
    });
    return state;
  });

  const [openDrawerList, setOpenDrawerList] = useState<string[]>(
    defaultOpenDrawers ??
      compact(
        componentsToDiff.map(([_base, _compare]) => {
          const drawerKey = _compare?.toStringWithoutVersion() ?? _base?.toStringWithoutVersion();
          return drawerKey;
        })
      )
  );

  const [fullScreenDrawerKey, setFullScreen] = useState<string | undefined>(defaultFullScreen);

  useEffect(() => {
    if (componentsToDiff.length > 0) {
      const compareState: LaneCompareState = new Map(defaultComponentCompareState);
      const drawerKeys: string[] = [];

      componentsToDiff.forEach(([_base, _compare]) => {
        const key = computeStateKey(_base, _compare);
        const baseKey = computeStateKey(_base);
        const compareKey = computeStateKey(undefined, _compare);
        compareState.set(key, defaultLaneState(key));
        compareState.set(baseKey, defaultLaneState(baseKey));
        compareState.set(compareKey, defaultLaneState(compareKey));
        // const drawerKey = _compare?.toStringWithoutVersion() ?? _base?.toStringWithoutVersion();
        // if (drawerKey) drawerKeys.push(drawerKey);
      });

      setLaneCompareState(compareState);
      setFullScreen(defaultFullScreen);
      setOpenDrawerList(defaultOpenDrawers ?? drawerKeys);
    }
  }, [loadingLaneDiff, componentsToDiff.length, base?.toString(), compare?.toString(), defaultComponentCompareState]);

  useEffect(() => {
    if (defaultOpenDrawers && !isEqual(openDrawerList, defaultOpenDrawers)) {
      setOpenDrawerList(defaultOpenDrawers);
    }
  }, [defaultOpenDrawers?.join('')]);

  useEffect(() => {
    if (defaultFullScreen && fullScreenDrawerKey !== defaultFullScreen) {
      setFullScreen(defaultFullScreen);
    }
  }, [defaultFullScreen]);

  const laneComponentDiffByCompId = useMemo(() => {
    if (!laneDiff) return new Map<string, LaneComponentDiff>();
    return laneDiff.diff.reduce((accum, next) => {
      accum.set(next.componentId.toStringWithoutVersion(), next as any);
      return accum;
    }, new Map<string, LaneComponentDiff>());
  }, [base?.toString(), compare?.toString(), loadingLaneDiff]);

  const groupedComponentsToDiff = useMemo(() => {
    if (laneComponentDiffByCompId.size === 0) return null;
    return componentsToDiff
      .filter((comps) => {
        if (!filter) return comps;
        const comp = comps[1] || comps[0];
        if (!comp) return comps;
        return filter(laneComponentDiffByCompId.get(comp.toStringWithoutVersion()), filters);
      })
      .reduce((accum, [baseId, compareId]) => {
        const compareIdStrWithoutVersion = compareId?.toStringWithoutVersion();
        const laneCompDiff = !compareIdStrWithoutVersion
          ? undefined
          : laneComponentDiffByCompId.get(compareIdStrWithoutVersion);

        const changeType = laneCompDiff?.changeType;

        const key = !groupBy ? compareIdStrWithoutVersion : (groupBy === 'status' && changeType) || compareId?.scope;

        if (!key) {
          return accum;
        }

        const existing = accum.get(key) || [];
        accum.set(key, existing.concat([[baseId, compareId]]));
        return accum;
      }, new Map<string, Array<[ComponentID | undefined, ComponentID | undefined]>>());
  }, [
    base?.toString(),
    compare?.toString(),
    laneComponentDiffByCompId.size,
    loadingLaneDiff,
    laneDiff,
    filterDepKey(filters),
    groupBy,
  ]);

  const [lastDrawerInteractedWith, setLastDrawerInteractedWith] = React.useState<string | undefined>();

  const laneCompareContextModel: LaneCompareContextModel = {
    laneCompareState,
    setLaneCompareState,
    openDrawerList,
    setOpenDrawerList,
    fullScreenDrawerKey,
    setFullScreen,
    filters,
    groupBy,
    defaultLaneState,
    laneDiff,
    loadingLaneDiff,
    componentsToDiff,
    groupedComponentsToDiff,
    laneComponentDiffByCompId,
    lastDrawerInteractedWith,
    setLastDrawerInteractedWith,
  };

  return <LaneCompareContext.Provider value={laneCompareContextModel}>{children}</LaneCompareContext.Provider>;
}

export const LaneCompareProvider = React.memo(_LaneCompareProvider);
