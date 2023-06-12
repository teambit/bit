import { Routes, Route } from 'react-router-dom';
import { MainDropdown, MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import { DropdownComponentVersion, GetActiveTabIndex, VersionDropdown } from '@teambit/component.ui.version-dropdown';
import type { ConsumeMethod } from '@teambit/ui-foundation.ui.use-box.menu';
import { useLocation } from '@teambit/base-react.navigation.link';
import { compact, flatten, groupBy, isFunction } from 'lodash';
import classnames from 'classnames';
import React, { useMemo } from 'react';
import { UseBoxDropdown } from '@teambit/ui-foundation.ui.use-box.dropdown';
import { useLanes as defaultUseLanes } from '@teambit/lanes.hooks.use-lanes';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { Menu as ConsumeMethodsMenu } from '@teambit/ui-foundation.ui.use-box.menu';
import { ComponentID } from '@teambit/component-id';
import * as semver from 'semver';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { Filters, useComponent as useComponentQuery, UseComponentType, useIdFromLocation } from '../use-component';
import { CollapsibleMenuNav } from './menu-nav';
import { OrderedNavigationSlot, ConsumeMethodSlot, ConsumePluginProps } from './nav-plugin';
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

  const RightSide = (
    <div className={styles.rightSide}>
      {RightNode || (
        <>
          <VersionRelatedDropdowns
            consumeMethods={consumeMethodSlot}
            host={host}
            componentId={componentId?.toString() || idFromLocation}
            useComponent={useComponent}
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
  consumeMethods?: ConsumeMethodSlot;
  className?: string;
  host: string;
  componentFilters?: Filters;
  loading?: boolean;
  componentId?: string;
  useComponent?: UseComponentType;
  versionHooks?: {
    initialLoad?: UseComponentVersions;
    loadVersions?: UseComponentVersions;
    loadVersion?: UseComponentVersion;
  };
  useLanes?: () => {
    loading?: boolean;
    lanesModel?: LanesModel;
  };
  getActiveTabIndex?: GetActiveTabIndex;
  showVersionDetails?: boolean;
};
export type UseComponentVersionsProps = {
  skip?: boolean;
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
  componentId?: ComponentID;
  packageName?: string;
  latestVersion?: string;
  currentVersion?: string;
  buildStatus?: string;
  /**
   * TBD - will be implement with lazy loading logs
   */
  // loadMoreTags?: (backwards?: boolean) => void;
  // loadMoreSnaps?: (backwards?: boolean) => void;
  // hasMoreTags?: boolean;
  // hasMoreSnaps?: boolean;
  loading?: boolean;
};

export const defaultLoadInitialVersions: (props: VersionRelatedDropdownsProps) => UseComponentVersions = ({
  componentFilters = {},
  loading: loadingFromProps,
  host,
  useComponent,
  componentId,
}) => {
  return React.useCallback(
    (_props) => {
      const { skip } = _props || {};
      // initially fetch just the component data
      const initialFetchOptions = {
        logFilters: {
          ...componentFilters,
          log: {
            logLimit: 3,
            ...componentFilters.log,
          },
        },
        skip: loadingFromProps || skip,
        customUseComponent: useComponent,
      };
      const {
        component,
        loading: loadingComponent,
        componentLogs = {},
      } = useComponentQuery(host, componentId, initialFetchOptions);
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
        componentId: component?.id,
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
};

export const defaultLoadMoreVersions: (props: VersionRelatedDropdownsProps) => UseComponentVersions = ({
  host,
  loading: loadingFromProps,
  componentFilters = {},
  useComponent,
  componentId,
}) => {
  return React.useCallback(
    (_props) => {
      const { skip } = _props || {};
      const componentWithLogsOptions = {
        logFilters: {
          ...componentFilters,
          log: {
            ...componentFilters.log,
            offset: undefined,
            limit: undefined,
          },
        },
        skip: loadingFromProps || skip,
        customUseComponent: useComponent,
      };
      const {
        component,
        loading: loadingComponent,
        componentLogs = {},
      } = useComponentQuery(host, componentId, componentWithLogsOptions);
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
        componentId: component?.id,
        packageName: component?.packageName,
        latestVersion: component?.latest,
        currentVersion: component?.version,
        buildStatus: component?.buildStatus,
        snaps,
        tags,
      };
    },
    [componentId, componentFilters, loadingFromProps]
  );
};

export const defaultLoadCurrentVersion: (props: VersionRelatedDropdownsProps) => UseComponentVersion = (props) => {
  return (_props) => {
    const { skip, version: _version } = _props || {};
    const { snaps, tags, currentVersion, loading } = props.versionHooks?.loadVersions?.({ skip }) ?? {};
    const version = _version ?? currentVersion;
    const isTag = React.useMemo(() => semver.valid(version), [loading, version]);
    if (isTag) {
      return React.useMemo(() => tags?.find((tag) => tag.tag === version), [loading, tags?.length, version]);
    }
    return React.useMemo(() => snaps?.find((snap) => snap.version === version), [loading, snaps?.length, version]);
  };
};

export function VersionRelatedDropdowns(props: VersionRelatedDropdownsProps) {
  const versionHooksWithDefaults = {
    initialLoad: defaultLoadInitialVersions(props),
    loadVersions: defaultLoadMoreVersions(props),
    loadVersion: undefined,
  };

  const updatedPropsWithDefaults = {
    ...props,
    versionHooks: {
      ...versionHooksWithDefaults,
      ...props.versionHooks,
    },
    useLanes: props.useLanes ?? defaultUseLanes,
    showVersionDetails: props.showVersionDetails ?? true,
  };

  updatedPropsWithDefaults.versionHooks.loadVersion = defaultLoadCurrentVersion(updatedPropsWithDefaults);
  const {
    versionHooks: { initialLoad, loadVersion, loadVersions },
    useLanes,
    host,
    consumeMethods,
    className,
    showVersionDetails,
  } = updatedPropsWithDefaults;
  const {
    loading,
    componentId,
    tags,
    snaps,
    latestVersion,
    packageName,
    currentVersion: _currentVersion,
    buildStatus,
  } = initialLoad();
  const location = useLocation();
  const { lanesModel } = useLanes();
  const lanes = componentId
    ? lanesModel?.getLanesByComponentId(componentId)?.filter((lane) => !lane.id.isDefault()) || []
    : [];
  const viewedLane =
    lanesModel?.viewedLane?.id && !lanesModel?.viewedLane?.id.isDefault() ? lanesModel.viewedLane : undefined;

  const isWorkspace = host === 'teambit.workspace/workspace';

  const isNew = tags?.length === 0 && snaps?.length === 0;

  const localVersion = isWorkspace && !isNew && (!viewedLane || lanesModel?.isViewingCurrentLane());

  const currentVersion =
    isWorkspace && !isNew && !location?.search.includes('version') ? 'workspace' : _currentVersion ?? '';

  const consumeMethodProps = React.useMemo(() => {
    return componentId && packageName
      ? {
          componentId,
          packageName,
          latest: latestVersion,
          options: { viewedLane, hide: buildStatus !== 'succeed' },
        }
      : undefined;
  }, [componentId, packageName, latestVersion, viewedLane, buildStatus]);

  const methods = useConsumeMethods(consumeMethods, consumeMethodProps);
  const hasMethods = methods?.length > 0;

  return (
    <>
      {consumeMethods && componentId && hasMethods && (
        <UseBoxDropdown
          position="bottom-end"
          className={classnames(styles.useBox, styles.hideOnMobile)}
          Menu={<ConsumeMethodsMenu methods={methods} componentName={componentId.name} />}
        />
      )}
      <VersionDropdown
        lanes={lanes}
        loading={loading}
        useComponentVersions={loadVersions}
        hasMoreVersions={!isNew}
        useCurrentVersionLog={loadVersion}
        localVersion={localVersion}
        currentVersion={currentVersion}
        latestVersion={latestVersion}
        currentLane={viewedLane}
        className={className}
        menuClassName={styles.componentVersionMenu}
        getActiveTabIndex={props.getActiveTabIndex}
        showVersionDetails={showVersionDetails}
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
