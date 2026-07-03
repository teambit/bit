import type { ReactNode } from 'react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { LaneCompareState } from '@teambit/lanes.ui.compare.lane-compare-state';
import { computeStateKey } from '@teambit/lanes.ui.compare.lane-compare-state';
import type { ComponentCompareState } from '@teambit/component.ui.component-compare.models.component-compare-state';
import type { MaybeLazyLoaded } from '@teambit/component.ui.component-compare.utils.lazy-loading';
import { extractLazyLoadedData } from '@teambit/component.ui.component-compare.utils.lazy-loading';
import { sortTabs } from '@teambit/component.ui.component-compare.utils.sort-tabs';
import type { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import type { LaneId } from '@teambit/lane-id';
import type { UseLaneDiffStatus } from '@teambit/lanes.ui.compare.lane-compare-hooks.use-lane-diff-status';
import { useLaneDiffStatus as defaultUseLaneDiffStatus } from '@teambit/lanes.ui.compare.lane-compare-hooks.use-lane-diff-status';
import type { LaneComponentDiff } from '@teambit/lanes.entities.lane-diff';
import type { ComponentID } from '@teambit/component-id';
import type { LaneCompareContextModel } from './lane-compare.context';
import { LaneCompareContext } from './lane-compare.context';
import type { LaneFilter } from './lane-compare.models';
import { extractCompsToDiff, filterDepKey } from './lane-compare.utils';

export type LaneCompareGroupBy = 'scope' | 'status';

export type LaneCompareProviderProps = {
  children: ReactNode;
  /**
   * default state of all component compare panels
   */
  defaultComponentCompareState?: LaneCompareState;
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

function LaneCompareProviderImpl({
  defaultComponentCompareState,
  tabs,
  children,
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
    // include `laneDiff` itself: an Apollo cache merge can update it without flipping `loadingLaneDiff`
    // or changing base/compare, and this derivation must not go stale (matches `groupedComponentsToDiff`).
    [loadingLaneDiff, base?.toString(), compare?.toString(), laneDiff]
  );

  // canonical key of the current pair set — used to re-init compare state when the *set* changes, not
  // just its size. two different diff sets can share a length, so keying on length alone would leave
  // stale keys for the previous set; the key changes only on real membership changes, so it also avoids
  // spuriously resetting state when componentsToDiff recomputes to the same set.
  const componentsToDiffKey = useMemo(
    () => componentsToDiff.map(([b, c]) => computeStateKey(b, c)).join('\n'),
    [componentsToDiff]
  );

  const defaultLaneState = useCallback(
    (compId?: string) => {
      const sortedTabs = extractLazyLoadedData(tabs)?.sort(sortTabs);

      const defaultState = (compId && defaultComponentCompareState?.get(compId)) || {};

      const value: ComponentCompareState = {
        tabs: {
          controlled: true,
          id: sortedTabs?.[0]?.id,
          element: sortedTabs?.[0]?.element,
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

  useEffect(() => {
    if (componentsToDiff.length > 0) {
      const compareState: LaneCompareState = new Map(defaultComponentCompareState);

      componentsToDiff.forEach(([_base, _compare]) => {
        const key = computeStateKey(_base, _compare);
        const baseKey = computeStateKey(_base);
        const compareKey = computeStateKey(undefined, _compare);
        compareState.set(key, defaultLaneState(key));
        compareState.set(baseKey, defaultLaneState(baseKey));
        compareState.set(compareKey, defaultLaneState(compareKey));
      });

      setLaneCompareState(compareState);
    }
  }, [loadingLaneDiff, componentsToDiffKey, base?.toString(), compare?.toString(), defaultComponentCompareState]);

  const laneComponentDiffByCompId = useMemo(() => {
    if (!laneDiff) return new Map<string, LaneComponentDiff>();
    return laneDiff.diff.reduce((accum, next) => {
      accum.set(next.componentId.toStringWithoutVersion(), next as any);
      return accum;
    }, new Map<string, LaneComponentDiff>());
    // `laneDiff` in deps for the same reason as `componentsToDiff`: track content, not just load state.
  }, [base?.toString(), compare?.toString(), loadingLaneDiff, laneDiff]);

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

  const laneCompareContextModel: LaneCompareContextModel = {
    laneCompareState,
    setLaneCompareState,
    filters,
    groupBy,
    defaultLaneState,
    laneDiff,
    loadingLaneDiff,
    componentsToDiff,
    groupedComponentsToDiff,
    laneComponentDiffByCompId,
  };

  return <LaneCompareContext.Provider value={laneCompareContextModel}>{children}</LaneCompareContext.Provider>;
}

export const LaneCompareProvider = React.memo(LaneCompareProviderImpl);
