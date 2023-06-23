import React, { useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import classnames from 'classnames';
import { compact, flatten, groupBy, isFunction } from 'lodash';
import * as semver from 'semver';
import { DropdownComponentVersion, GetActiveTabIndex, VersionDropdown } from '@teambit/component.ui.version-dropdown';
import { MainDropdown, MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import type { ConsumeMethod } from '@teambit/ui-foundation.ui.use-box.menu';
import { useLocation } from '@teambit/base-react.navigation.link';
import { UseBoxDropdown } from '@teambit/ui-foundation.ui.use-box.dropdown';
import { useLanes as defaultUseLanes } from '@teambit/lanes.hooks.use-lanes';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { Menu as ConsumeMethodsMenu } from '@teambit/ui-foundation.ui.use-box.menu';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { useComponent as useComponentQuery, UseComponentType, Filters } from '../use-component';
import { CollapsibleMenuNav } from './menu-nav';
import { OrderedNavigationSlot, ConsumeMethodSlot, ConsumePluginProps } from './nav-plugin';
import { useIdFromLocation } from '../use-component-from-location';
import { ComponentID } from '../..';
import styles from './menu.module.scss';

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

  useLanes?: () => {
    loading?: boolean;
    lanesModel?: LanesModel;
  };

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
  const componentFilters = useComponentFilters?.() || {};
  const useComponentVersions = defaultLoadVersions(
    host,
    componentId?.toString() || idFromLocation,
    componentFilters,
    useComponent
  );

  const RightSide = (
    <div className={styles.rightSide}>
      {RightNode || (
        <>
          <VersionRelatedDropdowns
            host={host}
            consumeMethods={consumeMethodSlot}
            componentId={componentId?.toString() || idFromLocation}
            useComponent={useComponentVersions}
            componentFilters={componentFilters}
            // loading={loading}
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
    [componentId, loadingFromProps, componentFilters]
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
  const lanes = id ? lanesModel?.getLanesByComponentId(id)?.filter((lane) => !lane.id.isDefault()) || [] : [];
  const viewedLane =
    lanesModel?.viewedLane?.id && !lanesModel?.viewedLane?.id.isDefault() ? lanesModel.viewedLane : undefined;

  const isWorkspace = host === 'teambit.workspace/workspace';

  const isNew = tags?.length === 0 && snaps?.length === 0;

  const localVersion = isWorkspace && !isNew && (!viewedLane || lanesModel?.isViewingCurrentLane());

  const currentVersion =
    isWorkspace && !isNew && !location?.search.includes('version') ? 'workspace' : _currentVersion ?? '';

  const consumeMethodProps: ConsumePluginProps | undefined = React.useMemo(() => {
    return id
      ? {
          id,
          packageName: packageName ?? '',
          latest,
          options: { viewedLane, disableInstall: !packageName },
        }
      : undefined;
  }, [id, packageName, latest, viewedLane]);

  const methods = useConsumeMethods(consumeMethods, consumeMethodProps);
  const hasMethods = methods?.length > 0;

  return (
    <>
      {consumeMethods && id && hasMethods && (
        <UseBoxDropdown
          position="bottom-end"
          className={classnames(styles.useBox, styles.hideOnMobile)}
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
