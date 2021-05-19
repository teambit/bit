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

  itemSlot?: SidebarItemSlot;
} & React.HTMLAttributes<HTMLDivElement>;

/**
 * side bar component.
 */
export function SideBar({ drawerSlot, itemSlot, ...rest }: SideBarProps) {
  const [openDrawerList, onToggleDrawer] = useState([drawerSlot.toArray()[0][0]]);
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
      {drawerSlot.toArray().map(([id, drawer]) => {
        if (!drawer || !drawer.name) return null;
        return (
          <DrawerUI
            isOpen={openDrawerList.includes(id)}
            onToggle={() => handleDrawerToggle(id)}
            key={id}
            name={drawer.name}
          >
            <drawer.render />
          </DrawerUI>
        );
      })}
    </div>
  );
}
