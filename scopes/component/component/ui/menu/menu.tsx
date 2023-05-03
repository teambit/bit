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
import type { ComponentModel } from '../component-model';
import { useComponent as useComponentQuery, UseComponentType } from '../use-component';
import { CollapsibleMenuNav } from './menu-nav';
import styles from './menu.module.scss';
import { OrderedNavigationSlot, ConsumeMethodSlot } from './nav-plugin';
import { useIdFromLocation } from '../use-component-from-location';
import { ComponentID } from '../..';
import { Filters } from '../use-component-query';
import { LegacyComponentLog } from '@teambit/legacy-component-log';

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

  path?: string;

  useComponentFilters?: () => Filters;
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
  const componentFiltersFromProps = useComponentFilters?.() || {};
  const useComponentOptions = {
    logFilters: {
      snapLog: {
        logLimit: 10,
      },
      tagLog: {
        logLimit: 10,
      },
      fetchLogsByTypeSeparately: true,
      ...componentFiltersFromProps,
    },
    customUseComponent: useComponent,
  };

  const { component, loading, loadMoreTags, loadMoreSnaps, hasMoreTags, hasMoreSnaps, snaps, tags } = useComponentQuery(
    host,
    componentId?.toString() || idFromLocation,
    useComponentOptions
  );

  const mainMenuItems = useMemo(() => groupBy(flatten(menuItemSlot.values()), 'category'), [menuItemSlot]);

  const RightSide = (
    <div className={styles.rightSide}>
      {RightNode || (
        <>
          <VersionRelatedDropdowns
            component={component}
            snaps={snaps}
            tags={tags}
            loadMoreSnaps={loadMoreSnaps}
            loadMoreTags={loadMoreTags}
            hasMoreSnaps={hasMoreSnaps}
            hasMoreTags={hasMoreTags}
            loading={loading}
            consumeMethods={consumeMethodSlot}
            host={host}
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

export function VersionRelatedDropdowns({
  component,
  snaps: snapsFromProps = [],
  tags: tagsFromProps = [],
  consumeMethods,
  loadMoreSnaps,
  loadMoreTags,
  hasMoreSnaps,
  hasMoreTags,
  className,
  loading,
  host,
}: {
  component?: ComponentModel;
  tags?: LegacyComponentLog[];
  snaps?: LegacyComponentLog[];
  loadMoreTags?: () => void;
  loadMoreSnaps?: () => void;
  hasMoreTags?: boolean;
  hasMoreSnaps?: boolean;
  loading?: boolean;
  consumeMethods?: ConsumeMethodSlot;
  className?: string;
  host: string;
}) {
  const location = useLocation();
  const { lanesModel } = useLanes();
  const viewedLane =
    lanesModel?.viewedLane?.id && !lanesModel?.viewedLane?.id.isDefault() ? lanesModel.viewedLane : undefined;
  const isWorkspace = host === 'teambit.workspace/workspace';

  const snaps = useMemo(() => {
    return (snapsFromProps || []).map((snap) => ({ ...snap, version: snap.hash }));
  }, [snapsFromProps]);

  const tags = useMemo(() => {
    return (tagsFromProps || []).map((tag) => ({ ...tag, version: tag.tag as string }));
  }, [tagsFromProps]);

  const isNew = snaps.length === 0 && tags.length === 0;

  const lanes = component?.id
    ? lanesModel?.getLanesByComponentId(component.id)?.filter((lane) => !lane.id.isDefault()) || []
    : [];
  const localVersion = isWorkspace && !isNew && (!viewedLane || lanesModel?.isViewingCurrentLane());

  const currentVersion =
    isWorkspace && !isNew && !location?.search.includes('version') ? 'workspace' : component?.version ?? '';

  const methods = useConsumeMethods(component, consumeMethods, viewedLane);

  return (
    <>
      {consumeMethods && tags.length > 0 && component?.id && (
        <UseBoxDropdown
          position="bottom-end"
          className={classnames(styles.useBox, styles.hideOnMobile)}
          Menu={<ConsumeMethodsMenu methods={methods} componentName={component.id.name} />}
        />
      )}
      <VersionDropdown
        tags={tags}
        snaps={snaps}
        lanes={lanes}
        loading={loading}
        loadMoreTags={loadMoreTags}
        loadMoreSnaps={loadMoreSnaps}
        hasMoreTags={hasMoreTags}
        hasMoreSnaps={hasMoreSnaps}
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
  // if (!consumeMethods || !componentModel) return [];
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
