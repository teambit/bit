import { Routes, Route } from 'react-router-dom';
import { MainDropdown, MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import { VersionDropdown } from '@teambit/component.ui.version-dropdown';
import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import type { ConsumeMethod } from '@teambit/ui-foundation.ui.use-box.menu';
import { useLocation } from '@teambit/base-react.navigation.link';
import { flatten, groupBy, compact } from 'lodash';
import classnames from 'classnames';
import React, { useMemo } from 'react';
import { UseBoxDropdown } from '@teambit/ui-foundation.ui.use-box.dropdown';
import { Menu as ConsumeMethodsMenu } from '@teambit/ui-foundation.ui.use-box.menu';
import { LaneModel, useLanesContext } from '@teambit/lanes.ui.lanes';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import type { ComponentModel } from '../component-model';
import { useComponent } from '../use-component';
import { MenuNav } from './menu-nav';
import { MobileMenuNav } from './mobile-menu-nav';
import styles from './menu.module.scss';
import { OrderedNavigationSlot, ConsumeMethodSlot } from './nav-plugin';
import { useIdFromLocation } from '../use-component-from-location';

export type MenuProps = {
  className?: string;
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
};

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
}: MenuProps) {
  const componentId = useIdFromLocation();
  const { component } = useComponent(host, componentId);
  const mainMenuItems = useMemo(() => groupBy(flatten(menuItemSlot.values()), 'category'), [menuItemSlot]);
  if (!component) return <FullLoader />;
  return (
    <Routes>
      <Route
        path={`${componentId}/*`}
        element={
          <div className={classnames(styles.topBar, className)}>
            <div className={styles.leftSide}>
              <MenuNav navigationSlot={navigationSlot} />
              <MobileMenuNav navigationSlot={navigationSlot} widgetSlot={widgetSlot} />
            </div>
            <div className={styles.rightSide}>
              <div className={styles.widgets}>
                <MenuNav navigationSlot={widgetSlot} />
              </div>
              <VersionRelatedDropdowns component={component} consumeMethods={consumeMethodSlot} host={host} />
              <MainDropdown menuItems={mainMenuItems} />
            </div>
          </div>
        }
      />
    </Routes>
  );
}

function VersionRelatedDropdowns({
  component,
  consumeMethods,
  host,
}: {
  component: ComponentModel;
  consumeMethods: ConsumeMethodSlot;
  host: string;
}) {
  const location = useLocation();
  const isNew = component.tags.isEmpty();
  const lanesContext = useLanesContext();
  const currentLane = lanesContext?.viewedLane;
  const { logs } = component;
  const isWorkspace = host === 'teambit.workspace/workspace';

  const snaps = useMemo(() => {
    return (logs || [])
      .filter((log) => !log.tag)
      .map((snap) => ({ ...snap, version: snap.hash }))
      .reverse();
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

  const lanes = lanesContext?.getLanesByComponentId(component.id) || [];
  const localVersion = isWorkspace && !isNew && !currentLane;

  const currentVersion =
    isWorkspace && !isNew && !location?.search.includes('version') ? 'workspace' : component.version;

  const methods = useConsumeMethods(consumeMethods, component, currentLane);
  return (
    <>
      {tags.length > 0 && (
        <UseBoxDropdown
          position="bottom-end"
          className={styles.useBox}
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
      />
    </>
  );
}

function useConsumeMethods(
  consumeMethods: ConsumeMethodSlot,
  componentModel: ComponentModel,
  currentLane?: LaneModel
): ConsumeMethod[] {
  return useMemo(
    () =>
      flatten(consumeMethods.values())
        .map((method) => {
          return method?.(componentModel, { currentLane });
        })
        .filter((x) => !!x && x.Component && x.Title) as ConsumeMethod[],
    [consumeMethods, componentModel, currentLane]
  );
}
