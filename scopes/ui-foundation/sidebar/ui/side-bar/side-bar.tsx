import React, { useState, useMemo } from 'react';
import { flatten } from 'lodash';
import { MenuSection } from '@teambit/design.ui.surfaces.menu.section';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { DrawerSlot, SidebarItemSlot } from '../../sidebar.ui.runtime';
import styles from './side-bar.module.scss';

export type SideBarProps = {
  /**
   * slot of registered drawers.
   */
  drawerSlot: DrawerSlot;
  /**
   * slot of registered items to the main section at the top.
   */
  itemSlot?: SidebarItemSlot;
} & React.HTMLAttributes<HTMLDivElement>;

/**
 * side bar component.
 */
export function SideBar({ drawerSlot, itemSlot, ...rest }: SideBarProps) {
  const drawers = flatten(drawerSlot.values());
  const [openDrawerList, onToggleDrawer] = useState<(string | undefined)[]>([drawers[0]?.id]);
  const items = useMemo(() => flatten(itemSlot?.values()), [itemSlot]);

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
        return (
          <DrawerUI
            isOpen={openDrawerList.includes(drawer.id)}
            onToggle={() => handleDrawerToggle(drawer.id)}
            key={drawer.id}
            name={drawer.name}
            Widget={drawer.widget}
            Context={drawer.Context}
          >
            <drawer.render />
          </DrawerUI>
        );
      })}
    </div>
  );
}
