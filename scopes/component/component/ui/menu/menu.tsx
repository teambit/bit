import { MainDropdown, MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import { VersionDropdown } from '@teambit/component.ui.version-dropdown';
import { FullLoader } from '@teambit/legacy/dist/to-eject/full-loader';
import type { ConsumeMethod } from '@teambit/ui-foundation.ui.use-box.menu';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';
import { compact, flatten, groupBy } from 'lodash';
import classnames from 'classnames';
import { useSnaps } from '@teambit/component.ui.hooks.use-snaps';
import React, { useMemo } from 'react';
import { UseBoxDropdown } from '@teambit/ui-foundation.ui.use-box.dropdown';
import { Menu as ConsumeMethodsMenu } from '@teambit/ui-foundation.ui.use-box.menu';
import { LaneModel, useLanesContext } from '@teambit/lanes.ui.lanes';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import type { ComponentModel } from '../component-model';
import { useComponent } from '../use-component';
import { MenuNav } from './menu-nav';
import styles from './menu.module.scss';
import { OrderedNavigationSlot, ConsumeMethodSlot } from './nav-plugin';

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
export function Menu({ navigationSlot, widgetSlot, className, host, menuItemSlot, consumeMethodSlot }: MenuProps) {
  const { component } = useComponent(host);
  const mainMenuItems = useMemo(() => groupBy(flatten(menuItemSlot.values()), 'category'), [menuItemSlot]);
  if (!component) return <FullLoader />;
  return (
    <div className={classnames(styles.topBar, className)}>
      <div className={styles.leftSide}>
        <MenuNav navigationSlot={navigationSlot} />
      </div>
      <div className={styles.rightSide}>
        <div className={styles.widgets}>
          <MenuNav navigationSlot={widgetSlot} />
        </div>
        <VersionRelatedDropdowns component={component} consumeMethods={consumeMethodSlot} host={host} />
        <MainDropdown menuItems={mainMenuItems} />
      </div>
    </div>
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
  const snapResult = useSnaps(component.id);
  const currentLane = lanesContext?.currentLane;
  const isWorkspace = host === 'teambit.workspace/workspace';

  const snaps = useMemo(() => {
    return (snapResult.snaps || []).filter((snap) => !snap.tag).map((snap) => ({ ...snap, version: snap.hash }));
  }, [snapResult.snaps]);

  const tags = useMemo(() => {
    const tagsArray = (snapResult.snaps || []).filter((snap) => snap.tag);
    const workspaceTag = { lane: 'main', parents: [], tag: 'workspace', hash: 'workspace', message: '' };
    const wsLink = [isWorkspace && !isNew && !currentLane ? workspaceTag : undefined];

    return compact([...wsLink, ...tagsArray]).map((tag) => ({ ...tag, version: tag.tag as string }));
  }, [isWorkspace, isNew, currentLane, snapResult.snaps]);

  const currentVersion =
    isWorkspace && !isNew && !location.search.includes('version') ? 'workspace' : component.version;

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
      <VersionDropdown tags={tags} snaps={snaps} currentVersion={currentVersion} latestVersion={component.latest} />
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
