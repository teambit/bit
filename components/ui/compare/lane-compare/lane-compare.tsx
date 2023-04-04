import React, { HTMLAttributes, useState, useCallback, useMemo, useEffect } from 'react';
import { compact, isEqual } from 'lodash';
import { ComponentID } from '@teambit/component-id';
import {
  ComponentCompareState,
  ComponentCompareStateData,
  ComponentCompareStateKey,
} from '@teambit/component.ui.component-compare.models.component-compare-state';
import { extractLazyLoadedData, MaybeLazyLoaded } from '@teambit/component.ui.component-compare.utils.lazy-loading';
import { ComponentCompareProps, TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { ComponentCompareHooks } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
import { sortTabs } from '@teambit/component.ui.component-compare.utils.sort-tabs';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { LaneCompareState, computeStateKey } from '@teambit/lanes.ui.compare.lane-compare-state';
import { LaneCompareLoader as DefaultLaneCompareLoader } from '@teambit/lanes.ui.compare.lane-compare-loader';
import {
  LaneCompareDrawer,
  LaneCompareDrawerName,
  LaneCompareDrawerProps,
  LaneCompareDrawerProvider,
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

export type DrawerWidgetProps = {
  drawerProps: {
    isOpen: boolean;
  };
  compareProps: ComponentCompareProps;
  isFullScreen?: boolean;
  base: LaneModel;
  compare: LaneModel;
};

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
   * Lane Compare Drawer Widgets
   */
  DrawerWidgets?: {
    Left?: React.ComponentType<DrawerWidgetProps>;
    Right?: React.ComponentType<DrawerWidgetProps>;
  };
  /**
   * loader to show when fetching lane diff status
   */
  LaneCompareLoader?: React.ComponentType;
  /**
   * loader to show when loading component compare data
   */
  ComponentCompareLoader?: React.ComponentType;
  /**
   * group component diffs by diff status or scope
   */
  groupBy?: 'scope' | 'status';
  /**
   * filter out component diffs by componentID or changeType
   */
  filter?: (laneComponentDiff?: LaneComponentDiff) => boolean;
  /**
   * callback called when lane compare toggles the full screen mode
   */
  onFullScreenChanged?: (drawerKey?: string) => void;
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
   * callback called when the state changes for any of the component compare drawers in lane compare
   */
  onStateChanged?: (
    update: {
      drawerKey: string;
      stateKey: ComponentCompareStateKey;
      data: ComponentCompareStateData | undefined;
    },
    state: LaneCompareState
  ) => void;
  /**
   * callback called when a component compare drawer open/closes
   */
  onDrawerToggled?: (openDrawers: string[]) => void;
} & HTMLAttributes<HTMLDivElement>;

export function LaneCompare({
  host,
  compare,
  base,
  tabs,
  customUseComponent,
  customUseLaneDiff: useLaneDiffStatus = defaultUseLaneDiffStatus,
  Drawer = LaneCompareDrawer,
  DrawerWidgets,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  LaneCompareLoader = DefaultLaneCompareLoader,
  ComponentCompareLoader,
  groupBy,
  className,
  filter,
  defaultComponentCompareState,
  onFullScreenChanged,
  // defaultComponentCompareState,
  defaultFullScreen,
  defaultOpenDrawers = [],
  onStateChanged,
  onDrawerToggled,
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
    [defaultComponentCompareState?.size, defaultComponentCompareState]
  );

  const [laneCompareState, setLaneCompareState] = useState<LaneCompareState>(() => {
    const state = new Map();
    allComponents.forEach(([_base, _compare]) => {
      const key = computeStateKey(_base, _compare);
      const baseKey = computeStateKey(_base);
      const compareKey = computeStateKey(undefined, _compare);
      const value = defaultLaneState(key);
      state.set(key, value);
      state.set(baseKey, value);
      state.set(compareKey, value);
    });
    return state;
  });

  const [openDrawerList, setOpenDrawerList] = useState<string[]>(
    defaultOpenDrawers ??
      compact(
        allComponents.map(([_base, _compare]) => {
          const drawerKey = _compare?.toStringWithoutVersion() ?? _base?.toStringWithoutVersion();
          return drawerKey;
        })
      )
  );
  const [fullScreenDrawerKey, setFullScreen] = useState<string | undefined>(defaultFullScreen);

  useEffect(() => {
    onDrawerToggled?.(openDrawerList);
  }, [openDrawerList.length]);

  useEffect(() => {
    if (defaultOpenDrawers && !isEqual(openDrawerList, defaultOpenDrawers)) {
      setOpenDrawerList(defaultOpenDrawers);
    }
  }, [defaultOpenDrawers.join('')]);

  useEffect(() => {
    if (defaultFullScreen && fullScreenDrawerKey !== defaultFullScreen) {
      setFullScreen(defaultFullScreen);
    }
  }, [defaultFullScreen]);

  useEffect(() => {
    if (allComponents.length > 0) {
      const compareState: LaneCompareState = new Map();
      const drawerKeys: string[] = [];

      allComponents.forEach(([_base, _compare]) => {
        const key = computeStateKey(_base, _compare);
        const value = defaultLaneState(key);
        compareState.set(key, value);
        const drawerKey = _compare?.toStringWithoutVersion() ?? _base?.toStringWithoutVersion();
        if (drawerKey) drawerKeys.push(drawerKey);
      });

      setLaneCompareState(compareState);
      setFullScreen(defaultFullScreen);
      setOpenDrawerList(defaultOpenDrawers ?? drawerKeys);
    }
  }, [loadingLaneDiff, allComponents.length, base.id.toString(), compare.id.toString(), defaultLaneState]);

  const handleDrawerToggle = (id?: string) => {
    if (!id) return;
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
    (key?: string) => (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (!key) return;
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

  useEffect(() => {
    onFullScreenChanged?.(fullScreenDrawerKey);
  }, [fullScreenDrawerKey]);

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
          existingState = defaultLaneState(_compare?.toStringWithoutVersion());
        }
        const update = new Map(value);
        onStateChanged?.({ drawerKey: key, stateKey: prop, data: existingState?.[prop] }, update);
        return update;
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
      preview: {
        onClick: onClicked('preview'),
      },
    };

    return _hooks;
  }, []);

  const laneComponentDiffByCompId = useMemo(() => {
    if (!laneDiff) return new Map<string, LaneComponentDiff>();
    return laneDiff.diff.reduce((accum, next) => {
      accum.set(next.componentId.toStringWithoutVersion(), next as any);
      return accum;
    }, new Map<string, LaneComponentDiff>());
  }, [base.id.toString(), compare.id.toString(), loadingLaneDiff]);

  const groupedComponents = useMemo(() => {
    if (laneComponentDiffByCompId.size === 0) return null;
    return allComponents
      .filter((comps) => {
        if (!filter) return comps;
        const comp = comps[1] || comps[0];
        if (!comp) return comps;
        return filter(laneComponentDiffByCompId.get(comp.toStringWithoutVersion()));
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
  }, [base.id.toString(), compare.id.toString(), laneComponentDiffByCompId.size, loadingLaneDiff, laneDiff]);

  const Loading = useMemo(() => {
    if (!loadingLaneDiff) return null;
    return <LaneCompareLoader />;
  }, [base.id.toString(), compare.id.toString(), loadingLaneDiff]);

  const ComponentCompares = useMemo(() => {
    if (!groupedComponents?.size) return [];

    const grouped =
      [...groupedComponents.entries()].sort(([aKey], [bKey]) => {
        if (groupBy === 'status') {
          return ChangeTypeGroupOrder.indexOf(aKey as ChangeType) - ChangeTypeGroupOrder.indexOf(bKey as ChangeType);
        }
        return aKey.localeCompare(bKey);
      }) || [];

    const ComponentCompare = (
      key: string,
      groupKey: string,
      compIds: [ComponentID | undefined, ComponentID | undefined][]
    ) => {
      return (
        <div key={`groupKey-${groupKey}`} className={styles.groupedComponentCompareContainer}>
          {groupBy && (
            <div className={classnames(styles.changeTypeTitle, groupBy === 'status' && styles.groupedStatus)}>
              {groupBy === 'status' && <H4>{displayChangeType(key as ChangeType).concat(` (${compIds.length})`)}</H4>}
              {groupBy === 'scope' && <H4>{key.concat(` (${compIds.length})`)}</H4>}
            </div>
          )}
          <div className={styles.groupedDrawers}>
            {compIds.map(([baseId, compareId]) => {
              const compKey = computeStateKey(baseId, compareId);
              const drawerKey =
                (compareId?.toStringWithoutVersion() && compareId?.toStringWithoutVersion()) || undefined;
              const open = !!drawerKey && openDrawerList.includes(drawerKey);
              const compareIdStrWithoutVersion = compareId?.toStringWithoutVersion();
              const changes =
                !compareIdStrWithoutVersion || loadingLaneDiff === undefined
                  ? undefined
                  : laneComponentDiffByCompId.get(compareIdStrWithoutVersion)?.changes;
              const isFullScreen = fullScreenDrawerKey === drawerKey;
              const compareProps: ComponentCompareProps = {
                host,
                tabs,
                baseId,
                compareId,
                changes,
                className: classnames(
                  styles.componentCompareContainer,
                  isFullScreen && styles.fullScreen,
                  fullScreenDrawerKey && styles.hasFullScreen
                ),
                state: laneCompareState.get(compKey),
                hooks: hooks(baseId, compareId),
                baseContext: {
                  state: laneCompareState.get(computeStateKey(baseId)),
                  hooks: hooks(baseId),
                },
                compareContext: {
                  state: laneCompareState.get(computeStateKey(undefined, compareId)),
                  hooks: hooks(undefined, compareId),
                },
                customUseComponent,
                Loader: ComponentCompareLoader,
              };

              // eslint-disable-next-line react/prop-types
              const LeftWidget = DrawerWidgets?.Left ? (
                <DrawerWidgets.Left
                  key={`left-widget-${compKey}`}
                  base={base}
                  compare={compare}
                  drawerProps={{ isOpen: open }}
                  compareProps={compareProps}
                />
              ) : null;

              // eslint-disable-next-line react/prop-types
              const RightWidget = DrawerWidgets?.Right ? (
                <DrawerWidgets.Right
                  key={`right-widget-${compKey}`}
                  base={base}
                  compare={compare}
                  drawerProps={{ isOpen: open }}
                  compareProps={compareProps}
                />
              ) : null;

              const drawerProps = {
                isOpen: open,
                onToggle: () => handleDrawerToggle(drawerKey),
                name: (
                  <LaneCompareDrawerName compareId={compareId} baseId={baseId} open={open} leftWidget={LeftWidget} />
                ),
                Widgets: [
                  RightWidget,
                  <div
                    key={'full-screen-icon'}
                    className={styles.fullScreenIcon}
                    onClick={onFullScreenClicked(drawerKey)}
                  >
                    <Icon of={fullScreenDrawerKey ? 'reduce' : 'expand'} />
                  </div>,
                ],
                className: classnames(
                  styles.componentCompareDrawer,
                  isFullScreen && styles.fullScreen,
                  fullScreenDrawerKey && styles.hasFullScreen
                ),
                contentClass: classnames(
                  styles.componentCompareDrawerContent,
                  isFullScreen && styles.fullScreen,
                  fullScreenDrawerKey && styles.hasFullScreen
                ),
              };

              return (
                <LaneCompareDrawerProvider
                  key={`${compKey}-provider`}
                  compareProps={compareProps}
                  drawerProps={drawerProps}
                  isFullScreen={isFullScreen}
                >
                  <Drawer
                    key={`${compKey}-drawer`}
                    isFullScreen={isFullScreen}
                    drawerProps={drawerProps}
                    compareProps={compareProps}
                  />
                </LaneCompareDrawerProvider>
              );
            })}
          </div>
        </div>
      );
    };

    return grouped.map(([key, compIds]) => {
      const groupKey = `${key}-group`;
      return ComponentCompare(key, groupKey, compIds);
    });
  }, [
    base.id.toString(),
    compare.id.toString(),
    openDrawerList.length,
    groupedComponents?.size,
    fullScreenDrawerKey,
    laneCompareState.size,
    laneCompareState,
  ]);

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

export function displayChangeType(changeType: ChangeType): string {
  switch (changeType) {
    case ChangeType.SOURCE_CODE:
      return 'code';
    case ChangeType.NONE:
      return 'no changes';
    default:
      return changeType.toLowerCase();
  }
}
