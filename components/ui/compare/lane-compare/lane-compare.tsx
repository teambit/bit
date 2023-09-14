import React, { HTMLAttributes, useCallback, useMemo, useEffect } from 'react';
import classnames from 'classnames';
import {
  ComponentCompareStateData,
  ComponentCompareStateKey,
} from '@teambit/component.ui.component-compare.models.component-compare-state';
import { extractLazyLoadedData, MaybeLazyLoaded } from '@teambit/component.ui.component-compare.utils.lazy-loading';
import { ComponentCompareProps, TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { ComponentCompareHooks } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { LaneCompareState, computeStateKey } from '@teambit/lanes.ui.compare.lane-compare-state';
import { LaneCompareLoader as DefaultLaneCompareLoader } from '@teambit/lanes.ui.compare.lane-compare-loader';
import {
  LaneCompareDrawer,
  LaneCompareDrawerName,
  LaneCompareDrawerProps,
  LaneCompareDrawerProvider,
} from '@teambit/lanes.ui.compare.lane-compare-drawer';
import { UseComponentType, ComponentID } from '@teambit/component';
import { H4 } from '@teambit/documenter.ui.heading';
import { UseLaneDiffStatus } from '@teambit/lanes.ui.compare.lane-compare-hooks.use-lane-diff-status';
import { ChangeType, LaneDiff } from '@teambit/lanes.entities.lane-diff';
import { Icon } from '@teambit/design.elements.icon';
import { Location, useLocation } from 'react-router-dom';
import { LaneCompareContextModel, useLaneCompareContext } from './lane-compare.context';
import { LaneCompareProvider } from './lane-compare.provider';

import styles from './lane-compare.module.scss';

export type DefaultLaneState = (
  compId?: string
) => Partial<Record<ComponentCompareStateKey, ComponentCompareStateData>>;
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

export type LaneFilter = {
  type: string;
  values: string[];
};

export const filterDepKey: (filters?: Array<LaneFilter>) => string | undefined = (filters) => {
  return filters?.map((f) => `${f.type}-${f.values.join()}`).join();
};

export function extractCompsToDiff(laneDiff?: LaneDiff): [ComponentID | undefined, ComponentID | undefined][] {
  return (
    (laneDiff?.diff &&
      laneDiff.diff.map((componentDiff) => [
        (componentDiff.targetHead && componentDiff.componentId.changeVersion(componentDiff.targetHead)) || undefined,
        componentDiff.componentId.changeVersion(componentDiff.sourceHead),
      ])) ||
    []
  );
}

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
   * callback called when lane compare toggles the full screen mode
   */
  onFullScreenChanged?: (drawerKey?: string, location?: Location) => void;

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
  /**
   * group component diffs by diff status or scope
   */
  groupBy?: 'scope' | 'status';
} & HTMLAttributes<HTMLDivElement>;

const _LaneCompareMemoized = React.memo(_LaneCompare);

export const LaneCompare = React.memo(function LaneCompareWrapper({ ...props }: LaneCompareProps) {
  const laneCompareContext = useLaneCompareContext();
  if (laneCompareContext) {
    return <_LaneCompare {...props} />;
  }
  return (
    <LaneCompareProvider
      {...{ ...props, base: props.base.id, compare: props.compare.id, useLaneDiffStatus: props.customUseLaneDiff }}
    >
      <_LaneCompareMemoized {...props} />
    </LaneCompareProvider>
  );
});

function _LaneCompare({
  host,
  compare,
  base,
  tabs,
  customUseComponent,
  Drawer = LaneCompareDrawer,
  DrawerWidgets,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  LaneCompareLoader = DefaultLaneCompareLoader,
  ComponentCompareLoader,
  onFullScreenChanged,
  onStateChanged,
  onDrawerToggled,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  groupBy,
  ...rest
}: LaneCompareProps) {
  const {
    openDrawerList = [],
    // setFullScreen,
    // setOpenDrawerList,
    fullScreenDrawerKey,
    // laneCompareState,
    setLaneCompareState,
    defaultLaneState,
    loadingLaneDiff,
    // groupBy,
    // groupedComponentsToDiff,
    // laneComponentDiffByCompId,
  } = useLaneCompareContext() as LaneCompareContextModel;

  useEffect(() => {
    onDrawerToggled?.(openDrawerList);
  }, [openDrawerList.length]);

  const hooks = useCallback((_base?: ComponentID, _compare?: ComponentID) => {
    const key = computeStateKey(_base, _compare);
    const _tabs = extractLazyLoadedData(tabs);

    const onClicked = (prop: ComponentCompareStateKey) => (id, e) => {
      e.preventDefault();
      e.stopPropagation();
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
    };

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

  const Loading = useMemo(() => {
    if (!loadingLaneDiff) return null;
    return <LaneCompareLoader />;
  }, [base.id.toString(), compare.id.toString(), loadingLaneDiff]);

  return (
    <div className={classnames(styles.rootLaneCompare)}>
      <div {...rest} className={classnames(styles.laneCompareContainer, !!fullScreenDrawerKey && styles.fullScreen)}>
        {Loading}
        {/* {...ComponentCompares} */}
        <GroupedComponentCompare
          base={base}
          compare={compare}
          Drawer={Drawer}
          host={host}
          customUseComponent={customUseComponent}
          tabs={tabs}
          hooks={hooks}
          onFullScreenChanged={onFullScreenChanged}
          ComponentCompareLoader={ComponentCompareLoader}
          DrawerWidgets={DrawerWidgets}
          loading={loadingLaneDiff}
        />
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

function GroupedComponentCompare({
  base,
  compare,
  Drawer,
  ComponentCompareLoader,
  DrawerWidgets,
  host,
  customUseComponent,
  tabs,
  hooks,
  loading,
  onFullScreenChanged,
}) {
  const {
    openDrawerList = [],
    setFullScreen,
    setOpenDrawerList,
    fullScreenDrawerKey,
    groupBy,
    groupedComponentsToDiff,
    laneComponentDiffByCompId,
  } = useLaneCompareContext() as LaneCompareContextModel;

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

  const location = useLocation();

  const onFullScreenClicked = React.useCallback(
    (key?: string) => (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (!key) return;
      onFullScreenChanged?.(fullScreenDrawerKey === key ? undefined : key, location);
      setFullScreen((fullScreenState) => {
        if (fullScreenState === key) return undefined;
        setOpenDrawerList((drawers) => {
          if (!drawers.includes(key)) return [...drawers, key];
          return drawers;
        });
        return key;
      });
    },
    [location]
  );

  const grouped = useMemo(
    () =>
      ((groupedComponentsToDiff && [...groupedComponentsToDiff.entries()]) || []).sort(([aKey], [bKey]) => {
        if (groupBy === 'status') {
          return ChangeTypeGroupOrder.indexOf(aKey as ChangeType) - ChangeTypeGroupOrder.indexOf(bKey as ChangeType);
        }
        return aKey.localeCompare(bKey);
      }) || [],
    [groupedComponentsToDiff, groupBy]
  );

  const groupedKey = grouped.map((g) => g[0]).join();

  return (
    <React.Fragment key={`grouped-lane-component-drawer-${groupedKey}`}>
      {grouped.map(([key, compIds]) => {
        const groupKey = `${key}-group`;
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
                const compareIdStrWithoutVersion = compareId?.toStringWithoutVersion();

                return (
                  <GroupedComponentCompareDrawer
                    key={`group-comp-${groupKey}-${compareIdStrWithoutVersion}`}
                    DrawerWidgets={DrawerWidgets}
                    Drawer={Drawer}
                    ComponentCompareLoader={ComponentCompareLoader}
                    host={host}
                    base={base}
                    compare={compare}
                    baseId={baseId}
                    compareId={compareId}
                    tabs={tabs}
                    hooks={hooks}
                    customUseComponent={customUseComponent}
                    onFullScreenClicked={onFullScreenClicked}
                    handleDrawerToggle={handleDrawerToggle}
                    fullScreenDrawerKey={fullScreenDrawerKey}
                    drawerKey={compareIdStrWithoutVersion}
                    open={!!compareIdStrWithoutVersion && openDrawerList.includes(compareIdStrWithoutVersion)}
                    changes={
                      !compareIdStrWithoutVersion || loading === undefined
                        ? undefined
                        : laneComponentDiffByCompId.get(compareIdStrWithoutVersion)?.changes
                    }
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </React.Fragment>
  );
}

function GroupedComponentCompareDrawer({
  baseId,
  compareId,
  open,
  changes,
  fullScreenDrawerKey,
  tabs,
  host,
  hooks,
  DrawerWidgets,
  base,
  compare,
  handleDrawerToggle,
  onFullScreenClicked,
  Drawer,
  customUseComponent,
  ComponentCompareLoader,
  drawerKey,
}) {
  const { laneCompareState } = useLaneCompareContext() as LaneCompareContextModel;
  const compKey = computeStateKey(baseId, compareId);
  // const drawerKey =
  //   (compareId?.toStringWithoutVersion() && compareId?.toStringWithoutVersion()) || undefined;
  // const open = !!drawerKey && openDrawerList.includes(drawerKey);
  // const compareIdStrWithoutVersion = compareId?.toStringWithoutVersion();
  // const changes: ChangeType[] = !compareIdStrWithoutVersion || loading === undefined
  //   ? undefined
  //   : laneComponentDiffByCompId.get(compareIdStrWithoutVersion)?.changes;
  const isFullScreen = fullScreenDrawerKey === drawerKey;
  const state = laneCompareState.get(compKey);

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
    state,
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
    isFullScreen,
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
    name: <LaneCompareDrawerName compareId={compareId} baseId={baseId} open={open} leftWidget={LeftWidget} />,
    Widgets: [
      RightWidget,
      <div key={'full-screen-icon'} className={styles.fullScreenIcon} onClick={onFullScreenClicked(drawerKey)}>
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
}
