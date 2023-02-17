import React, { HTMLAttributes, useState, useCallback, useMemo, useEffect } from 'react';
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
import { H4 } from '@teambit/documenter.ui.heading';
import {
  useLaneDiffStatus as defaultUseLaneDiffStatus,
  UseLaneDiffStatus,
} from '@teambit/lanes.ui.compare.lane-compare-hooks.use-lane-diff-status';
import { ChangeType, LaneComponentDiff } from '@teambit/lanes.entities.lane-diff';
import { Icon } from '@teambit/design.elements.icon';
import classnames from 'classnames';

import styles from './lane-compare.module.scss';

export type LaneFilterType = ChangeType | 'ALL';
export const ChangeTypeGroupOrder = [
  ChangeType.NEW,
  ChangeType.SOURCE_CODE,
  ChangeType.ASPECTS,
  ChangeType.DEPENDENCY,
  ChangeType.NONE,
];
export type LaneCompareProps = {
  base: LaneModel;
  compare: LaneModel;
  host: string;
  tabs?: MaybeLazyLoaded<TabItem[]>;
  /**
   * hook to override fetching component data for component compare
   */
  customUseComponent?: UseComponentType;
  /**
   * hook to override fetching lane diff status for base and compare
   */
  customUseLaneDiff?: UseLaneDiffStatus;
  /**
   * @default LaneCompareDrawer
   * override each Lane Component Compare Drawer Component
   */
  Drawer?: React.ComponentType<LaneCompareDrawerProps>;
  /**
   * loader to show when fetching lane diff status
   */
  LaneCompareLoader?: React.ComponentType;
  /**
   * loader to show when loading component compare data
   */
  ComponentCompareLoader?: React.ComponentType;
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
  className,
  ...rest
}: LaneCompareProps) {
  const { loading: loadingLaneDiff, laneDiff } = useLaneDiffStatus({
    baseId: base.id.toString(),
    compareId: compare.id.toString(),
    options: {
      skipUpToDate: true,
    },
  });

  const allComponents = useMemo(
    () =>
      (laneDiff?.diff &&
        laneDiff.diff.map((componentDiff) => [
          (componentDiff.targetHead && componentDiff.componentId.changeVersion(componentDiff.targetHead)) || undefined,
          componentDiff.componentId.changeVersion(componentDiff.sourceHead),
        ])) ||
      [],
    [loadingLaneDiff, base.id.toString(), compare.id.toString()]
  );

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

  const [laneCompareState, setLaneCompareState] = useState<LaneCompareState>(
    new Map(
      allComponents.map(([_base, _compare]) => {
        const key = computeStateKey(_base, _compare);
        const value = defaultState();
        return [key, value];
      })
    )
  );

  const [openDrawerList, setOpenDrawerList] = useState<string[]>([]);
  const [fullScreenDrawerKey, setFullScreen] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (allComponents.length > 0) {
      setLaneCompareState(
        new Map(
          allComponents.map(([_base, _compare]) => {
            const key = computeStateKey(_base, _compare);
            const value = defaultState();
            return [key, value];
          })
        )
      );
      setFullScreen(undefined);
      setOpenDrawerList([]);
    }
  }, [loadingLaneDiff, allComponents.length, base.id.toString(), compare.id.toString()]);

  const handleDrawerToggle = (id: string) => {
    const isDrawerOpen = openDrawerList.includes(id);
    if (isDrawerOpen) {
      setOpenDrawerList((list) => list.filter((drawer) => drawer !== id));
      if (id === fullScreenDrawerKey) {
        setFullScreen(undefined);
      }
      return;
    }
    setOpenDrawerList((list) => list.concat(id));
  };

  const onFullScreenClicked = useCallback(
    (key: string) => (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      setFullScreen((fullScreenState) => {
        if (fullScreenState === key) return undefined;
        setOpenDrawerList((drawers) => {
          if (!drawers.includes(key)) return [...drawers, key];
          return drawers;
        });
        return key;
      });
    },
    []
  );

  const hooks = useCallback((_base?: ComponentID, _compare?: ComponentID) => {
    const key = computeStateKey(_base, _compare);
    const _tabs = extractLazyLoadedData(tabs);

    const onClicked = (prop: ComponentCompareStateKey) => (id) =>
      setLaneCompareState((value) => {
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
    return laneDiff.diff.reduce((accum, next) => {
      accum.set(next.componentId.toStringWithoutVersion(), next);
      return accum;
    }, new Map<string, LaneComponentDiff>());
  }, [base.id.toString(), compare.id.toString(), loadingLaneDiff]);

  const groupedComponents = useMemo(() => {
    if (laneComponentDiffByCompId.size === 0) return null;
    return allComponents.reduce((accum, [baseId, compareId]) => {
      const compareIdStrWithoutVersion = compareId?.toStringWithoutVersion();
      const laneCompDiff = !compareIdStrWithoutVersion
        ? undefined
        : laneComponentDiffByCompId.get(compareIdStrWithoutVersion);

      const changeType = laneCompDiff?.changeType;

      if (!changeType) {
        return accum;
      }

      const existing = accum.get(changeType) || [];
      accum.set(changeType, existing.concat([[baseId, compareId]]));
      return accum;
    }, new Map<ChangeType, Array<[ComponentID | undefined, ComponentID | undefined]>>());
  }, [base.id.toString(), compare.id.toString(), laneComponentDiffByCompId.size, loadingLaneDiff, laneDiff]);

  const Loading = useMemo(() => {
    if (!loadingLaneDiff) return null;
    return <LaneCompareLoader />;
  }, [base.id.toString(), compare.id.toString(), loadingLaneDiff]);

  const ComponentCompares = useMemo(() => {
    if (!groupedComponents?.size) return [];
    const grouped = [...groupedComponents.entries()]
      .sort(
        ([aChangeType], [bChangeType]) =>
          ChangeTypeGroupOrder.indexOf(aChangeType) - ChangeTypeGroupOrder.indexOf(bChangeType)
      )
      .filter(([changeType]) => changeType !== ChangeType.NONE);

    return grouped.map(([changeType, compIds]) => {
      const groupKey = `${changeType}-group`;
      return (
        <div key={groupKey} className={styles.groupedComponentCompareContainer}>
          <div className={styles.changeTypeTitle}>
            <H4>{displayChangeType(changeType).concat(` (${compIds.length})`)}</H4>
          </div>
          <div className={styles.groupedDrawers}>
            {compIds.map(([baseId, compareId]) => {
              const compKey = computeStateKey(baseId, compareId);
              const open = openDrawerList.includes(compKey);
              const compareIdStrWithoutVersion = compareId?.toStringWithoutVersion();
              const changes =
                !compareIdStrWithoutVersion || loadingLaneDiff === undefined
                  ? undefined
                  : laneComponentDiffByCompId.get(compareIdStrWithoutVersion)?.changes;
              const isFullScreen = fullScreenDrawerKey === compKey;
              return (
                <Drawer
                  key={`${compKey}-drawer`}
                  isFullScreen={isFullScreen}
                  drawerProps={{
                    isOpen: open,
                    onToggle: () => handleDrawerToggle(compKey),
                    name: <LaneCompareDrawerName compareId={compareId} baseId={baseId} open={open} />,
                    Widgets: [
                      <div
                        key={'full-screen-icon'}
                        className={styles.fullScreenIcon}
                        onClick={onFullScreenClicked(compKey)}
                      >
                        <Icon of={fullScreenDrawerKey ? 'reduce' : 'expand'} />
                      </div>,
                    ],
                    className: classnames(styles.componentCompareDrawer, isFullScreen && styles.fullScreen),
                    contentClass: classnames(styles.componentCompareDrawerContent, isFullScreen && styles.fullScreen),
                  }}
                  compareProps={{
                    host,
                    tabs,
                    baseId,
                    compareId,
                    changes,
                    className: classnames(styles.componentCompareContainer, isFullScreen && styles.fullScreen),
                    state: laneCompareState.get(compKey),
                    hooks: hooks(baseId, compareId),
                    customUseComponent,
                    Loader: ComponentCompareLoader,
                  }}
                />
              );
            })}
          </div>
        </div>
      );
    });
  }, [base.id.toString(), compare.id.toString(), openDrawerList.length, groupedComponents?.size, fullScreenDrawerKey]);

  return (
    <div className={styles.rootLaneCompare}>
      <div
        {...rest}
        className={classnames(styles.laneCompareContainer, !!fullScreenDrawerKey && styles.fullScreen, className)}
      >
        {Loading}
        {...ComponentCompares}
      </div>
    </div>
  );
}

function displayChangeType(changeType: ChangeType): string {
  switch (changeType) {
    case ChangeType.SOURCE_CODE:
      return 'code';
    default:
      return changeType.toLowerCase();
  }
}
