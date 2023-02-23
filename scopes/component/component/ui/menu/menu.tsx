import { Routes, Route } from 'react-router-dom';
import { MainDropdown, MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import { VersionDropdown } from '@teambit/component.ui.version-dropdown';
import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import type { ConsumeMethod } from '@teambit/ui-foundation.ui.use-box.menu';
import { useLocation } from '@teambit/base-react.navigation.link';
import { flatten, groupBy, compact, isFunction } from 'lodash';
import classnames from 'classnames';
import React, { useMemo } from 'react';
import { UseBoxDropdown } from '@teambit/ui-foundation.ui.use-box.dropdown';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { Menu as ConsumeMethodsMenu } from '@teambit/ui-foundation.ui.use-box.menu';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import type { ComponentModel } from '../component-model';
import { useComponent as useComponentQuery, UseComponentType } from '../use-component';
import { CollapsibleMenuNav } from './menu-nav';
import styles from './menu.module.scss';
import { OrderedNavigationSlot, ConsumeMethodSlot } from './nav-plugin';
import { useIdFromLocation } from '../use-component-from-location';
import { ComponentID } from '../..';
import { Filters } from '../use-component-query';

export type MenuProps = {
  className?: string;

  /**
   * skip the right side.
   */
  skipRightSide?: boolean;

  /**
   * slot for top bar menu nav items
   */
  navigationSlot: OrderedNavigationSlot;
  /**
   * right side menu item slot
   */
  widgetSlot: OrderedNavigationSlot;
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
  useComponent,
  path,
  useComponentFilters,
}: MenuProps) {
  const idFromLocation = useIdFromLocation();
  const _componentIdStr = getComponentIdStr(componentIdStr);
  const componentId = _componentIdStr ? ComponentID.fromString(_componentIdStr) : undefined;
  const resolvedComponentIdStr = path || idFromLocation;

  const useComponentOptions = {
    logFilters: useComponentFilters?.(),
    customUseComponent: useComponent,
  };

  const { component } = useComponentQuery(host, componentId?.toString() || idFromLocation, useComponentOptions);
  const mainMenuItems = useMemo(() => groupBy(flatten(menuItemSlot.values()), 'category'), [menuItemSlot]);
  if (!component) return <FullLoader />;
  return (
    <Routes>
      <Route
        path={`${resolvedComponentIdStr}/*`}
        element={
          <div className={classnames(styles.topBar, className)}>
            <div className={styles.leftSide}>
              <CollapsibleMenuNav navigationSlot={navigationSlot} widgetSlot={widgetSlot} />
            </div>
            {!skipRightSide && (
              <div className={styles.rightSide}>
                <VersionRelatedDropdowns component={component} consumeMethods={consumeMethodSlot} host={host} />
                <MainDropdown className={styles.hideOnMobile} menuItems={mainMenuItems} />
              </div>
            )}
          </div>
        }
      />
    </Routes>
  );
}

export function VersionRelatedDropdowns({
  component,
  consumeMethods,
  className,
  host,
}: {
  component: ComponentModel;
  consumeMethods?: ConsumeMethodSlot;
  className?: string;
  host: string;
}) {
  const location = useLocation();
  const { lanesModel } = useLanes();
  const currentLane =
    lanesModel?.viewedLane?.id && !lanesModel?.viewedLane?.id.isDefault() ? lanesModel.viewedLane : undefined;

  const { logs } = component;
  const isWorkspace = host === 'teambit.workspace/workspace';

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
      component.tags
        ?.toArray()
        .reverse()
        .map((tag) => tagLookup.get(tag.version.version))
    ).map((tag) => ({ ...tag, version: tag.tag as string }));
  }, [logs]);

  const isNew = snaps.length === 0 && tags.length === 0;

  const lanes = lanesModel?.getLanesByComponentId(component.id)?.filter((lane) => !lane.id.isDefault()) || [];
  const localVersion = isWorkspace && !isNew && !currentLane;

  const currentVersion =
    isWorkspace && !isNew && !location?.search.includes('version') ? 'workspace' : component.version;

  const methods = useConsumeMethods(component, consumeMethods, currentLane);
  return (
    <>
      {consumeMethods && tags.length > 0 && (
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
        localVersion={localVersion}
        currentVersion={currentVersion}
        latestVersion={component.latest}
        currentLane={currentLane}
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
