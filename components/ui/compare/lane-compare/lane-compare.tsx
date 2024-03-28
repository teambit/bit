/* eslint-disable react/prop-types */
import React, { HTMLAttributes, useCallback, useMemo, useEffect } from 'react';
import classnames from 'classnames';
import { ComponentID, UseComponentType } from '@teambit/component';
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
  type LaneCompareDrawerProps,
  LaneCompareDrawerProvider,
} from '@teambit/lanes.ui.compare.lane-compare-drawer';
import { H4 } from '@teambit/documenter.ui.heading';
import {
  useLaneDiffStatus as defaultUseLaneDiffStatus,
  UseLaneDiffStatus,
} from '@teambit/lanes.ui.compare.lane-compare-hooks.use-lane-diff-status';
import { ChangeType } from '@teambit/lanes.entities.lane-diff';
import { useLocation, Location } from '@teambit/base-react.navigation.link';
import { Icon } from '@teambit/design.elements.icon';
import { LaneCompareContextModel, useLaneCompareContext } from './lane-compare.context';
import { LaneCompareProvider } from './lane-compare.provider';
import { ChangeTypeGroupOrder, DrawerWidgetProps } from './lane-compare.models';
import { displayChangeType } from './lane-compare.utils';

import styles from './lane-compare.module.scss';

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
  groupBy?: 'scope' | 'status';
} & HTMLAttributes<HTMLDivElement>;

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
}: {
  baseId?: ComponentID;
  compareId?: ComponentID;
  open: boolean;
  changes?: ChangeType[] | null;
  fullScreenDrawerKey?: string;
  tabs?: MaybeLazyLoaded<TabItem[]>;
  host: string;
  hooks: (base?: ComponentID, compare?: ComponentID) => ComponentCompareHooks;
  DrawerWidgets?: {
    Left?: React.ComponentType<DrawerWidgetProps>;
    Right?: React.ComponentType<DrawerWidgetProps>;
  };
  base: LaneModel;
  compare: LaneModel;
  handleDrawerToggle: (id?: string) => void;
  onFullScreenClicked: (key?: string) => (e: React.MouseEvent<HTMLDivElement>) => void;
  Drawer: React.ComponentType<LaneCompareDrawerProps>;
  customUseComponent?: UseComponentType;
  ComponentCompareLoader?: React.ComponentType;
  drawerKey: string;
}) {
  const { laneCompareState } = useLaneCompareContext() as LaneCompareContextModel;
  const compKey = computeStateKey(baseId, compareId);
  const state = laneCompareState.get(compKey);
  const compareIdOverride = state?.drawer?.compareOverride
    ? ComponentID.tryFromString(state?.drawer?.compareOverride)
    : undefined;
  const isFullScreen = fullScreenDrawerKey === drawerKey;

  const compareProps: ComponentCompareProps = {
    host,
    tabs,
    baseId,
    compareId,
    changes,
    compareIdOverride,
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
    name: (
      <LaneCompareDrawerName
        compareId={compareId}
        baseId={baseId}
        open={open}
        leftWidget={LeftWidget}
        compareIdOverride={compareIdOverride}
      />
    ),
    Widgets: [
      RightWidget,
      <div
        key="full-screen-icon"
        className={styles.fullScreenIcon}
        onClick={onFullScreenClicked(drawerKey)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'Space') {
            onFullScreenClicked(drawerKey);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <Icon of={fullScreenDrawerKey ? 'reduce' : 'expand'} aria-label={fullScreenDrawerKey ? 'Minimize' : 'Expand'} />
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
}: {
  base: LaneModel;
  compare: LaneModel;
  Drawer: React.ComponentType<LaneCompareDrawerProps>;
  ComponentCompareLoader?: React.ComponentType;
  DrawerWidgets?: {
    Left?: React.ComponentType<DrawerWidgetProps>;
    Right?: React.ComponentType<DrawerWidgetProps>;
  };
  host: string;
  customUseComponent?: UseComponentType;
  tabs?: MaybeLazyLoaded<TabItem[]>;
  hooks: (base?: ComponentID, compare?: ComponentID) => ComponentCompareHooks;
  loading: boolean | undefined;
  onFullScreenChanged?: (key?: string, location?: Location) => void;
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
      setFullScreen((fullScreenState) => {
        onFullScreenChanged?.(fullScreenState === key ? undefined : key, location);
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

  const groupWrapperKey = grouped.map((g) => g[0]).join();

  return (
    <React.Fragment key={`grouped-lane-component-drawer-${groupWrapperKey}`}>
      {grouped.map(([key, compIds]) => {
        const groupedKey = `${key}-group`;
        return (
          <div key={`groupKey-${groupedKey}`} className={styles.groupedComponentCompareContainer}>
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
                    key={`group-comp-${groupedKey}-${compareIdStrWithoutVersion}`}
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
                    drawerKey={compareIdStrWithoutVersion ?? ''}
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

function LaneCompareImpl({
  host,
  compare,
  base,
  tabs,
  customUseComponent,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  customUseLaneDiff: useLaneDiffStatus = defaultUseLaneDiffStatus,
  Drawer = LaneCompareDrawer,
  DrawerWidgets,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  LaneCompareLoader = DefaultLaneCompareLoader,
  ComponentCompareLoader,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  className,
  onFullScreenChanged,
  onStateChanged,
  onDrawerToggled,
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
    // groupedComponentsToDiff,
    // laneComponentDiffByCompId,
  } = useLaneCompareContext() as LaneCompareContextModel;

  useEffect(() => {
    onDrawerToggled?.(openDrawerList);
  }, [openDrawerList.length]);

  const hooks = useCallback((_base?: ComponentID, _compare?: ComponentID) => {
    const key = computeStateKey(_base, _compare);
    const extractedTabs = extractLazyLoadedData(tabs);

    const onClicked = (prop: ComponentCompareStateKey) => (id?: string, e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      setLaneCompareState((value) => {
        let existingState = value.get(key);
        const propState = existingState?.[prop];
        if (propState) {
          propState.id = id;
          propState.element = extractedTabs?.find((_tab) => _tab.id === id)?.element;
        } else {
          existingState = defaultLaneState(_compare?.toStringWithoutVersion());
        }
        const update = new Map(value);
        onStateChanged?.({ drawerKey: key, stateKey: prop, data: existingState?.[prop] }, update);
        return update;
      });
    };

    const hooksWithClickHandlers: ComponentCompareHooks = {
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

    return hooksWithClickHandlers;
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

const LaneCompareMemoized = React.memo(LaneCompareImpl);

export const LaneCompare = React.memo(function LaneCompareWrapper({ ...props }: LaneCompareProps) {
  const laneCompareContext = useLaneCompareContext();
  if (laneCompareContext) {
    return <LaneCompareImpl {...props} />;
  }
  return (
    <LaneCompareProvider
      {...{ ...props, base: props.base.id, compare: props.compare.id, useLaneDiffStatus: props.customUseLaneDiff }}
    >
      <LaneCompareMemoized {...props} />
    </LaneCompareProvider>
  );
});
