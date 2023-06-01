import { Routes, Route } from 'react-router-dom';
import { MainDropdown, MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import { VersionDropdown } from '@teambit/component.ui.version-dropdown';
import type { ConsumeMethod } from '@teambit/ui-foundation.ui.use-box.menu';
import { useLocation } from '@teambit/base-react.navigation.link';
import { flatten, groupBy, isFunction } from 'lodash';
import classnames from 'classnames';
import React, { useMemo } from 'react';
import { UseBoxDropdown } from '@teambit/ui-foundation.ui.use-box.dropdown';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { Menu as ConsumeMethodsMenu } from '@teambit/ui-foundation.ui.use-box.menu';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { ComponentID } from '@teambit/component-id';
import * as semver from 'semver';
import type { ComponentModel } from '../component-model';
import { Filters, useComponent as useComponentQuery, UseComponentType, useIdFromLocation } from '../use-component';
import { CollapsibleMenuNav } from './menu-nav';
import styles from './menu.module.scss';
import { OrderedNavigationSlot, ConsumeMethodSlot } from './nav-plugin';

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
   * right side menu item slot
   */
  widgetSlot: OrderedNavigationSlot;
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

  path?: string;
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
  host,
  menuItemSlot,
  consumeMethodSlot,
  componentIdStr,
  skipRightSide,
  RightNode,
  useComponent,
  path,
  useComponentFilters,
}: MenuProps) {
  const idFromLocation = useIdFromLocation();
  const _componentIdStr = getComponentIdStr(componentIdStr);
  const componentId = _componentIdStr ? ComponentID.fromString(_componentIdStr) : undefined;
  const resolvedComponentIdStr = path || idFromLocation;
  const mainMenuItems = useMemo(() => groupBy(flatten(menuItemSlot.values()), 'category'), [menuItemSlot]);
  const { loading, ...componentFiltersFromProps } = useComponentFilters?.() || {};

  const RightSide = (
    <div className={styles.rightSide}>
      {RightNode || (
        <>
          <VersionRelatedDropdowns
            consumeMethods={consumeMethodSlot}
            host={host}
            componentId={componentId?.toString() || idFromLocation}
            useComponent={useComponent}
            componentFilters={componentFiltersFromProps}
            loading={loading}
          />
          <MainDropdown className={styles.hideOnMobile} menuItems={mainMenuItems} />
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
            {!skipRightSide && <div className={styles.rightSide}>{RightSide}</div>}
          </div>
        }
      />
    </Routes>
  );
}

export type VersionRelatedDropdownsProps = {
  consumeMethods?: ConsumeMethodSlot;
  className?: string;
  host: string;
  componentFilters?: Filters;
  loading?: boolean;
  useComponent?: UseComponentType;
  componentId?: string;
};

export function VersionRelatedDropdowns({
  componentId,
  componentFilters: componentFiltersFromProps = {},
  useComponent,
  consumeMethods,
  className,
  loading: loadingFromProps,
  host,
}: VersionRelatedDropdownsProps) {
  const query = useQuery();
  const componentVersion = query.get('version');
  const isTag = componentVersion ? semver.valid(componentVersion) : undefined;
  const isSnap = componentVersion ? !isTag : undefined;

  // initially fetch just the component data
  const initialFetchOptions = React.useMemo(
    () => ({
      logFilters: {
        ...componentFiltersFromProps,
        log: {
          logLimit: 3,
          ...componentFiltersFromProps.log,
        },
      },
      skip: loadingFromProps,
      customUseComponent: useComponent,
    }),
    [loadingFromProps, componentFiltersFromProps, componentVersion]
  );

  const { component, loading: loadingComponent } = useComponentQuery(host, componentId, initialFetchOptions);

  const loading = React.useMemo(() => loadingComponent || loadingFromProps, [loadingComponent, loadingFromProps]);

  const useVersions = React.useCallback(() => {
    const componentWithLogsOptions = {
      logFilters: {
        fetchLogsByTypeSeparately: true,
        ...componentFiltersFromProps,
        snapLog: {
          logLimit: 10,
          logStartFrom: isSnap ? componentVersion ?? undefined : undefined,
          logOffset: isSnap ? -3 : undefined,
          ...componentFiltersFromProps.snapLog,
        },
        tagLog: {
          logLimit: 10,
          logStartFrom: isTag ? componentVersion ?? undefined : undefined,
          logOffset: isTag ? -3 : undefined,
          ...componentFiltersFromProps.tagLog,
        },
      },
      skip: loadingFromProps,
      customUseComponent: useComponent,
    };

    const { componentLogs = {}, loading: loadingLogs } = useComponentQuery(host, componentId, componentWithLogsOptions);
    return {
      loading: loadingLogs,
      ...componentLogs,
      snaps: (componentLogs.snaps || []).map((snap) => ({ ...snap, version: snap.hash })),
      tags: (componentLogs.tags || []).map((tag) => ({ ...tag, version: tag.tag as string })),
    };
  }, [componentVersion, isTag, isSnap, componentFiltersFromProps, loadingFromProps]);

  const location = useLocation();
  const { lanesModel } = useLanes();
  const lanes = component?.id
    ? lanesModel?.getLanesByComponentId(component.id)?.filter((lane) => !lane.id.isDefault()) || []
    : [];
  const viewedLane =
    lanesModel?.viewedLane?.id && !lanesModel?.viewedLane?.id.isDefault() ? lanesModel.viewedLane : undefined;

  const isWorkspace = host === 'teambit.workspace/workspace';

  const isNew = component?.logs?.length === 0;

  const localVersion = isWorkspace && !isNew && (!viewedLane || lanesModel?.isViewingCurrentLane());

  const currentVersion =
    isWorkspace && !isNew && !location?.search.includes('version') ? 'workspace' : component?.version ?? '';

  const methods = useConsumeMethods(component, consumeMethods, viewedLane);

  return (
    <>
      {consumeMethods && (component?.tags?.size ?? 0) > 0 && component?.id && (
        <UseBoxDropdown
          position="bottom-end"
          className={classnames(styles.useBox, styles.hideOnMobile)}
          Menu={<ConsumeMethodsMenu methods={methods} componentName={component.id.name} />}
        />
      )}
      <VersionDropdown
        lanes={lanes}
        loading={loading}
        useComponentVersions={useVersions}
        hasMoreVersions={!isNew}
        localVersion={localVersion}
        currentVersion={currentVersion}
        latestVersion={component?.latest}
        currentLane={viewedLane}
        className={className}
        menuClassName={styles.componentVersionMenu}
      />
    </>
  );
}

function useConsumeMethods(
  componentModel?: ComponentModel,
  consumeMethods?: ConsumeMethodSlot,
  currentLane?: LaneModel
): ConsumeMethod[] {
  return useMemo(
    () =>
      flatten(consumeMethods?.values())
        .map((method) => {
          if (!componentModel) return undefined;
          return method?.(componentModel, { currentLane });
        })
        .filter((x) => !!x && x.Component && x.Title) as ConsumeMethod[],
    [consumeMethods, componentModel, currentLane]
  );
}
