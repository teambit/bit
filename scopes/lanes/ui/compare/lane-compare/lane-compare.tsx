import React, { HTMLAttributes, useState, useCallback, useMemo } from 'react';
import { ComponentID } from '@teambit/component-id';
import {
  ComponentCompareState,
  ComponentCompareStateKey,
} from '@teambit/component.ui.component-compare.models.component-compare-state';
import { extractLazyLoadedData, MaybeLazyLoaded } from '@teambit/component.ui.component-compare.utils.lazy-loading';
import { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { ComponentCompareHooks } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
import { sortTabs } from '@teambit/component.ui.component-compare.utils.sort-tabs';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { LaneCompareState, computeStateKey } from '@teambit/lanes.ui.compare.lane-compare-state';
import { LaneCompareLoader as DefaultLaneCompareLoader } from '@teambit/lanes.ui.compare.lane-compare-loader';
import {
  LaneCompareDrawer,
  LaneCompareDrawerName,
  LaneCompareDrawerProps,
} from '@teambit/lanes.ui.compare.lane-compare-drawer';
import { UseComponentType } from '@teambit/component';
import {
  useLaneDiffStatus as defaultUseLaneDiffStatus,
  UseLaneDiffStatus,
} from '@teambit/lanes.ui.compare.lane-compare-hooks.use-lane-diff-status';
import { ChangeType, LaneComponentDiff } from '@teambit/dot-lanes.entities.lane-diff';
// import { BlockSkeleton } from '@teambit/base-ui.loaders.skeleton';
// import { MultiSelect, ItemType } from '@teambit/design.inputs.selectors.multi-select';

import styles from './lane-compare.module.scss';

export type LaneFilterType = ChangeType | 'ALL';

export type LaneCompareProps = {
  base: LaneModel;
  compare: LaneModel;
  host: string;
  tabs?: MaybeLazyLoaded<TabItem[]>;
  customUseComponent?: UseComponentType;
  customUseLaneDiff?: UseLaneDiffStatus;
  Drawer?: React.ComponentType<LaneCompareDrawerProps>;
  LaneCompareLoader?: React.ComponentType<{ loading?: boolean }>;
  ComponentCompareLoader?: React.ComponentType<{ loading?: boolean }>;
} & HTMLAttributes<HTMLDivElement>;

export function LaneCompare({
  host,
  compare,
  base,
  tabs,
  customUseComponent,
  customUseLaneDiff: useLaneDiffStatus = defaultUseLaneDiffStatus,
  Drawer = LaneCompareDrawer,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  LaneCompareLoader = DefaultLaneCompareLoader,
  ComponentCompareLoader,
  ...rest
}: LaneCompareProps) {
  const { loading: loadingLaneDiff, laneDiff } = useLaneDiffStatus({
    baseId: base.id.toString(),
    compareId: compare.id.toString(),
    options: {
      skipUpToDate: true,
    },
  });

  const baseMap = useMemo(
    () => new Map<string, ComponentID>(base.components.map((c) => [c.toStringWithoutVersion(), c])),
    [base.components]
  );
  const compareMap = useMemo(
    () => new Map<string, ComponentID>(compare.components.map((c) => [c.toStringWithoutVersion(), c])),
    [compare.components]
  );

  const newComponents = useMemo(
    () =>
      compare.components
        .filter((componentId) => !baseMap.has(componentId.toStringWithoutVersion()))
        .map((c) => [undefined, compareMap.get(c.toStringWithoutVersion()) as ComponentID]),
    [base, compare]
  );
  const commonComponents = useMemo(
    () =>
      compare.components
        .filter((componentId) => {
          const compIdStr = componentId.toStringWithoutVersion();
          const baseCompId = baseMap.get(compIdStr);
          return baseCompId && !baseCompId.isEqual(componentId);
        })
        .map((cc) => [
          baseMap.get(cc.toStringWithoutVersion()) as ComponentID,
          compareMap.get(cc.toStringWithoutVersion()) as ComponentID,
        ]),
    [base.components, compare.components]
  );

  const allComponents = useMemo(() => [...newComponents, ...commonComponents], [base.components, compare.components]);

  const defaultState = useCallback(() => {
    const _tabs = extractLazyLoadedData(tabs)?.sort(sortTabs);

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
      versionPicker: {
        element: null,
      },
    };
    return value;
  }, []);

  const [state, setState] = useState<LaneCompareState>(
    new Map(
      allComponents.map(([_base, _compare]) => {
        const key = computeStateKey(_base, _compare);
        const value = defaultState();
        return [key, value];
      })
    )
  );

  const [openDrawerList, onToggleDrawer] = useState<string[]>([]);
  // const [filtersState, setFiltersState] = useState<LaneFilterType[]>(['ALL']);

  const handleDrawerToggle = (id: string) => {
    const isDrawerOpen = openDrawerList.includes(id);
    if (isDrawerOpen) {
      onToggleDrawer((list) => list.filter((drawer) => drawer !== id));
      return;
    }
    onToggleDrawer((list) => list.concat(id));
  };

  const hooks = useCallback((_base?: ComponentID, _compare?: ComponentID) => {
    const key = computeStateKey(_base, _compare);
    const _tabs = extractLazyLoadedData(tabs);

    const onClicked = (prop: ComponentCompareStateKey) => (id) =>
      setState((value) => {
        let existingState = value.get(key);
        const propState = existingState?.[prop];
        if (propState) {
          propState.id = id;
          propState.element = _tabs?.find((_tab) => _tab.id === id)?.element;
        } else {
          existingState = defaultState();
        }
        return new Map(value);
      });

    const _hooks: ComponentCompareHooks = {
      code: {
        onClick: onClicked('code'),
      },
      aspects: {
        onClick: onClicked('aspects'),
      },
      tabs: {
        onClick: onClicked('tabs'),
      },
    };

    return _hooks;
  }, []);

  const laneComponentDiffByCompId = useMemo(() => {
    if (!laneDiff) return new Map<string, LaneComponentDiff>();
    return laneDiff.changed.reduce((accum, next) => {
      accum.set(next.componentId.toStringWithoutVersion(), next);
      return accum;
    }, new Map<string, LaneComponentDiff>());
  }, [loadingLaneDiff]);

  const ComponentCompares = useMemo(() => {
    return allComponents.map(([baseId, compareId]) => {
      const key = computeStateKey(baseId, compareId);
      const open = openDrawerList.includes(key);
      const compareIdStrWithoutVersion = compareId?.toStringWithoutVersion();
      const changeType =
        !compareIdStrWithoutVersion || loadingLaneDiff === undefined
          ? undefined
          : laneComponentDiffByCompId.get(compareIdStrWithoutVersion)?.changeType;

      return (
        <Drawer
          key={`${key}-drawer`}
          drawerProps={{
            isOpen: open,
            onToggle: () => handleDrawerToggle(key),
            name: <LaneCompareDrawerName compareId={compareId} baseId={baseId} open={open} />,
            className: styles.componentCompareDrawer,
            contentClass: styles.componentCompareDrawerContent,
          }}
          compareProps={{
            host,
            tabs,
            baseId,
            compareId,
            changeType,
            className: styles.componentCompareContainer,
            state: state.get(key),
            hooks: hooks(baseId, compareId),
            customUseComponent,
            Loader: ComponentCompareLoader,
          }}
        />
      );
    });
  }, [base.id.toString(), compare.id.toString(), openDrawerList.length, laneComponentDiffByCompId]);

  // const Filter = useMemo(() => {
  //   if (loadingLaneDiff) {
  //     return (
  //       <div className={styles.loader}>
  //         <BlockSkeleton lines={1} />
  //       </div>
  //     );
  //   }

  //   if (laneComponentDiffByCompId.size === 0) return null;
  //   const laneCompDiffs = laneDiff?.changed || [];
  //   const uniqueChangeTypes: LaneFilterType[] = ['ALL', ...new Set(laneCompDiffs.map((l) => l.changeType)).values()];
  //   const selectList: ItemType[] = uniqueChangeTypes.map((filter) => ({
  //     value: filter,
  //     checked: !!filtersState.find((filterState) => filterState === filter),
  //   }));
  //   const onCheck = (value, e: React.ChangeEvent<HTMLInputElement>) => {
  //     const checked = e.target.checked;

  //     setFiltersState((currentState) => {
  //       if (checked) {
  //         currentState.push(value);
  //         return currentState;
  //       }
  //       return currentState.filter((c) => c !== value);
  //     });
  //   };
  //   return (
  //     <div className={styles.laneFilterContainer}>
  //       <MultiSelect itemsList={selectList} onCheck={onCheck} />
  //     </div>
  //   );
  // }, [loadingLaneDiff]);

  return (
    <div {...rest} className={styles.laneCompareContainer}>
      {...ComponentCompares}
    </div>
  );
}
