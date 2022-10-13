import React, { useState, ComponentType } from 'react';
import { flatten } from 'lodash';
import classNames from 'classnames';
import { MenuSection } from '@teambit/design.ui.surfaces.menu.section';
import { DrawerType, DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { DrawerSlot } from '../../sidebar.ui.runtime';
import styles from './side-bar.module.scss';

export type SideBarProps = {
  /**
   * slot of registered drawers.
   */
  drawerSlot: DrawerSlot;
  /**
   * slot of registered items to the main section at the top.
   */
  items?: ComponentType[];
} & React.HTMLAttributes<HTMLDivElement>;

/**
 * side bar component.
 */
export function SideBar({ drawerSlot, items = [], ...rest }: SideBarProps) {
  const drawers = flatten(drawerSlot.values())
    .filter((drawer) => !drawer?.isHidden?.())
    .sort(sortFn);

  const [openDrawerList, onToggleDrawer] = useState<(string | undefined)[]>(drawers.map((drawer) => drawer.id));

  const handleDrawerToggle = (id: string) => {
    const isDrawerOpen = openDrawerList.includes(id);
    if (isDrawerOpen) {
      onToggleDrawer((list) => list.filter((drawer) => drawer !== id));
      return;
    }
    onToggleDrawer((list) => list.concat(id));
  };

  return (
    <div {...rest} className={styles.sidebar}>
      <MenuSection items={items} />
      {drawers.map((drawer) => {
        if (!drawer || !drawer.name) return null;
        // consider passing collapse all as a prop so each drawer collapses itself
        const isOpen = openDrawerList.includes(drawer.id);

        return (
          <DrawerUI
            className={classNames(styles.sidebarDrawer, isOpen && styles.open)}
            isOpen={isOpen}
            onToggle={() => handleDrawerToggle(drawer.id)}
            key={drawer.id}
            name={drawer.name}
            Widgets={drawer.widgets}
            Context={drawer.Context}
          >
            <drawer.render />
          </DrawerUI>
        );
      })}
    </div>
  );
}
function sortFn(first: DrawerType, second: DrawerType) {
  // 0  - equal
  // <0 - first < second
  // >0 - first > second

  return (first.order ?? 0) - (second.order ?? 0);
}
