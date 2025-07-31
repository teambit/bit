import type { ReactNode } from 'react';
import React, { useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import classnames from 'classnames';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { compact, flatten, groupBy, isFunction, orderBy } from 'lodash';
import * as semver from 'semver';
import type { SlotRegistry } from '@teambit/harmony';
import type { DropdownComponentVersion, GetActiveTabIndex } from '@teambit/component.ui.version-dropdown';
import { VersionDropdown } from '@teambit/component.ui.version-dropdown';
import type { MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import { MainDropdown } from '@teambit/ui-foundation.ui.main-dropdown';
import { ComponentID } from '@teambit/component-id';
import type { ConsumeMethod } from '@teambit/ui-foundation.ui.use-box.menu';
import { useLocation } from '@teambit/base-react.navigation.link';
import { UseBoxDropdown } from '@teambit/ui-foundation.ui.use-box.dropdown';
import { useLanes as defaultUseLanes } from '@teambit/lanes.hooks.use-lanes';
import type { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { Menu as ConsumeMethodsMenu } from '@teambit/ui-foundation.ui.use-box.menu';
import type { LegacyComponentLog } from '@teambit/legacy-component-log';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import type { UseComponentType, Filters } from '../use-component';
import { useComponent as useComponentQuery } from '../use-component';
import { CollapsibleMenuNav } from './menu-nav';
import type {
  OrderedNavigationSlot,
  ConsumeMethodSlot,
  ConsumePluginProps,
  NavPlugin,
  NavPluginProps,
} from './nav-plugin';
import { useIdFromLocation } from '../use-component-from-location';
import { TopBarNav } from '../top-bar-nav';

import styles from './menu.module.scss';

export type RightSideMenuItem = { item: ReactNode; order: number };
export type RightSideMenuSlot = SlotRegistry<RightSideMenuItem[]>;

export type MenuProps = {
  className?: string;
  /**
   * skip the right side.
   */
  skipRightSide?: boolean;
  /**
   * custom render the right side
   */
  RightNode?: React.ReactNode;
  /**
   * slot for top bar menu nav items
   */
  navigationSlot: OrderedNavigationSlot;
  /**
   * right side navigation menu item slot
   */
  widgetSlot: OrderedNavigationSlot;
  /**
   * pinned widgets slots - right side of the widget slot
   */
  pinnedWidgetSlot: OrderedNavigationSlot;
  /**
   * right side menu item slot
   */
  rightSideMenuSlot: RightSideMenuSlot;
  /**
   * workspace or scope
   */
  host: string;
  /**
   * main dropdown item slot
   */
  menuItemSlot: MenuItemSlot;

  consumeMethodSlot: ConsumeMethodSlot;

  componentIdStr?: string | (() => string | undefined);

  useComponent?: UseComponentType;

  useComponentFilters?: () => Filters;

  useLanes?: () => {
    loading?: boolean;
    lanesModel?: LanesModel;
  };

  path?: string;

  authToken?: string;
};
function getComponentIdStr(componentIdStr?: string | (() => string | undefined)): string | undefined {
  if (isFunction(componentIdStr)) return componentIdStr();
  return componentIdStr;
}
/**
 * top bar menu.
 */
export function ComponentMenu({
  navigationSlot,
  widgetSlot,
  className,
  host: hostFromProps,
  menuItemSlot,
  consumeMethodSlot,
  rightSideMenuSlot,
  componentIdStr,
  skipRightSide,
  RightNode,
  useComponent,
  path,
  useComponentFilters,
  authToken,
  pinnedWidgetSlot,
}: MenuProps) {
  const { isMinimal } = useWorkspaceMode();
  const idFromLocation = useIdFromLocation();
  const componentIdStrWithScopeFromLocation = useIdFromLocation(undefined, true);
  const _componentIdStr = getComponentIdStr(componentIdStr);
  const componentId = _componentIdStr ? ComponentID.fromString(_componentIdStr) : undefined;
  const resolvedComponentIdStr = path || idFromLocation;
  const mainMenuItems = useMemo(() => groupBy(flatten(menuItemSlot.values()), 'category'), [menuItemSlot]);
  const rightSideItems = useMemo(() => orderBy(flatten(rightSideMenuSlot.values()), 'order'), [rightSideMenuSlot]);
  const pinnedWidgets = useMemo(
    () =>
      flatten(
        pinnedWidgetSlot
          .toArray()
          .sort(sortFn)
          .map(([, pinnedWidget]) => pinnedWidget)
      ),
    [pinnedWidgetSlot]
  );
  const componentFilters = useComponentFilters?.() || {};
  const query = useQuery();
  const componentVersion = query.get('version');
  const host = componentVersion ? 'teambit.scope/scope' : hostFromProps;

  const useComponentVersions = defaultLoadVersions(
    host,
    componentId?.toString() || componentIdStrWithScopeFromLocation,
    componentFilters,
    useComponent
  );

  const RightSide = (
    <div className={styles.rightSide}>
      {RightNode || (
        <>
          <VersionRelatedDropdowns
            host={hostFromProps}
            consumeMethods={consumeMethodSlot}
            componentId={componentId?.toString() || idFromLocation}
            useComponent={useComponentVersions}
            componentFilters={componentFilters}
            authToken={authToken}
            // loading={loading}
          />
          {rightSideItems.map(({ item }) => item)}
          {!isMinimal && <MainDropdown className={styles.hideOnMobile} menuItems={mainMenuItems} />}
        </>
      )}
    </div>
  );

  return (
    <Routes>
      <Route
        path={`${resolvedComponentIdStr}/*`}
        element={
          <div className={classnames(styles.topBar, className)}>
            <div className={styles.leftSide}>
              <CollapsibleMenuNav navigationSlot={navigationSlot} widgetSlot={widgetSlot} />
            </div>
            {isMinimal &&
              pinnedWidgets.map((pinnedWidget) => (
                <PinnedWidgetComponent key={`key-${pinnedWidget.order}`} {...pinnedWidget.props} />
              ))}
            {!skipRightSide && <div className={styles.rightSide}>{RightSide}</div>}
          </div>
        }
      />
    </Routes>
  );
}

export type VersionRelatedDropdownsProps = {
  componentId?: string;
  consumeMethods?: ConsumeMethodSlot;
  componentFilters?: Filters;
  useComponent?: UseComponentVersions;
  className?: string;
  loading?: boolean;
  host: string;
  useLanes?: () => {
    loading?: boolean;
    lanesModel?: LanesModel;
  };
  dropdownOptions?: {
    showVersionDetails?: boolean;
    getActiveTabIndex?: GetActiveTabIndex;
  };
  authToken?: string;
};
export type UseComponentVersionsProps = {
  skip?: boolean;
  id?: string;
  initialLoad?: boolean;
};
export type UseComponentVersionProps = {
  skip?: boolean;
  version?: string;
};
export type UseComponentVersions = (props?: UseComponentVersionsProps) => UseComponentVersionsResult;
export type UseComponentVersion = (props?: UseComponentVersionProps) => DropdownComponentVersion | undefined;
export type UseComponentVersionsResult = {
  tags?: DropdownComponentVersion[];
  snaps?: DropdownComponentVersion[];
  id?: ComponentID;
  packageName?: string;
  latest?: string;
  currentVersion?: string;
  loading?: boolean;
};

export function defaultLoadVersions(
  host: string,
  componentId?: string,
  componentFilters: Filters = {},
  useComponent?: UseComponentType,
  loadingFromProps?: boolean
): UseComponentVersions {
  return React.useCallback(
    (_props) => {
      const { skip, initialLoad } = _props || {};
      const fetchOptions = {
        logFilters: {
          ...componentFilters,
          log: {
            ...componentFilters.log,
            limit: initialLoad ? 3 : undefined,
          },
        },
        skip: loadingFromProps || skip,
        customUseComponent: useComponent,
      };
      const {
        component,
        loading: loadingComponent,
        componentLogs = {},
      } = useComponentQuery(host, componentId, fetchOptions);
      const logs = componentLogs?.logs;
      const loading = React.useMemo(
        () => loadingComponent || loadingFromProps || componentLogs.loading,
        [loadingComponent, loadingFromProps, componentLogs.loading]
      );

      const snaps = useMemo(() => {
        return (logs || []).filter((log) => !log.tag).map((snap) => ({ ...snap, version: snap.hash }));
      }, [logs]);

      const tags = useMemo(() => {
        const tagLookup = new Map<string, LegacyComponentLog>();
        (logs || [])
          .filter((log) => log.tag)
          .forEach((tag) => {
            tagLookup.set(tag?.tag as string, tag);
          });
        return compact(
          (component?.tags?.toArray() || []).reverse().map((tag) => tagLookup.get(tag.version.version))
        ).map((tag) => ({ ...tag, version: tag.tag as string }));
      }, [logs]);

      return {
        loading,
        id: component?.id,
        packageName: component?.packageName,
        latestVersion: component?.latest,
        currentVersion: component?.version,
        snaps,
        tags,
        buildStatus: component?.buildStatus,
      };
    },
    [componentId, loadingFromProps, componentFilters, host]
  );
}

export const defaultLoadCurrentVersion: (props: VersionRelatedDropdownsProps) => UseComponentVersion = (props) => {
  return (_props) => {
    const { skip, version: _version } = _props || {};
    const { snaps, tags, currentVersion, loading } = props.useComponent?.({ skip, id: props.componentId }) ?? {};
    const version = _version ?? currentVersion;
    const isTag = React.useMemo(() => semver.valid(version), [loading, version]);
    if (isTag) {
      return React.useMemo(() => tags?.find((tag) => tag.tag === version), [loading, tags?.length, version]);
    }
    return React.useMemo(() => snaps?.find((snap) => snap.version === version), [loading, snaps?.length, version]);
  };
};

export function VersionRelatedDropdowns(props: VersionRelatedDropdownsProps) {
  const updatedPropsWithDefaults = {
    ...props,
    useLanes: props.useLanes ?? defaultUseLanes,
    dropdownOptions: {
      ...props.dropdownOptions,
      showVersionDetails: props?.dropdownOptions?.showVersionDetails ?? true,
    },
  };

  const loadVersion = defaultLoadCurrentVersion(updatedPropsWithDefaults);

  const { useLanes, consumeMethods, className, dropdownOptions, host } = updatedPropsWithDefaults;
  const {
    loading,
    id,
    tags,
    snaps,
    latest,
    packageName,
    currentVersion: _currentVersion,
  } = props.useComponent?.({ initialLoad: true }) || {};
  const location = useLocation();
  const { lanesModel } = useLanes();
  const lanes = id ? lanesModel?.getLanesByComponentId(id as any)?.filter((lane) => !lane.id.isDefault()) || [] : [];
  const viewedLane =
    lanesModel?.viewedLane?.id && !lanesModel?.viewedLane?.id.isDefault() ? lanesModel.viewedLane : undefined;

  const isWorkspace = host === 'teambit.workspace/workspace';

  const isNew = tags?.length === 0 && snaps?.length === 0;

  const localVersion = isWorkspace && !isNew && (!viewedLane || lanesModel?.isViewingCurrentLane());

  const currentVersion =
    isWorkspace && !isNew && !location?.search.includes('version') ? 'workspace' : (_currentVersion ?? '');

  const authToken = props.authToken;

  const consumeMethodProps: ConsumePluginProps | undefined = React.useMemo(() => {
    return id
      ? {
          id,
          packageName: packageName ?? '',
          latest,
          options: { viewedLane, disableInstall: !packageName },
          authToken,
        }
      : undefined;
  }, [id, packageName, latest, viewedLane, authToken]);
  const methods = useConsumeMethods(consumeMethods, consumeMethodProps);
  const hasMethods = methods?.length > 0;

  return (
    <>
      {consumeMethods && id && hasMethods && (
        <UseBoxDropdown
          position="bottom-end"
          className={classnames(styles.useBox, styles.hideOnMobile)}
          dropClass={styles.useBoxContainer}
          Menu={<ConsumeMethodsMenu methods={methods} componentName={id.name} />}
        />
      )}
      <VersionDropdown
        lanes={lanes}
        loading={loading}
        useComponentVersions={props.useComponent}
        hasMoreVersions={!isNew}
        useCurrentVersionLog={loadVersion}
        localVersion={localVersion}
        currentVersion={currentVersion}
        latestVersion={latest}
        currentLane={viewedLane}
        className={className}
        menuClassName={styles.componentVersionMenu}
        getActiveTabIndex={dropdownOptions?.getActiveTabIndex}
        showVersionDetails={dropdownOptions?.showVersionDetails}
      />
    </>
  );
}

function useConsumeMethods(
  consumeMethods?: ConsumeMethodSlot,
  consumePluginProps?: ConsumePluginProps
): ConsumeMethod[] {
  return useMemo(
    () =>
      flatten(consumeMethods?.values())
        .map((method) => {
          if (!consumePluginProps) return undefined;
          return method?.(consumePluginProps);
        })
        .filter((x) => !!x && x.Component && x.Title) as ConsumeMethod[],
    [consumeMethods, consumePluginProps]
  );
}

function sortFn([, { order: first }]: [string, NavPlugin], [, { order: second }]: [string, NavPlugin]) {
  return (first ?? 0) - (second ?? 0);
}

function PinnedWidgetComponent(menuItemProps: NavPluginProps) {
  return (
    <TopBarNav
      {...menuItemProps}
      style={{ ...menuItemProps.style, height: '100%' }}
      className={classnames(menuItemProps?.className)}
    >
      {menuItemProps?.children}
    </TopBarNav>
  );
}
