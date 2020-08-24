import React, { useState } from 'react';

import { DrawerSlot } from '../../sidebar.ui.runtime';
import { DrawerUI } from '../drawer';
import styles from './side-bar.module.scss';

export type SideBarProps = {
  /**
   * slot of registered drawers.
   */
  drawerSlot: DrawerSlot;
};

/**
 * side bar component.
 */
export function SideBar({ drawerSlot }: SideBarProps) {
  const [openDrawerList, onToggleDrawer] = useState([drawerSlot.toArray()[0][0]]);

  const handleDrawerToggle = (id: string) => {
    const isDrawerOpen = openDrawerList.includes(id);
    if (isDrawerOpen) {
      onToggleDrawer((list) => list.filter((drawer) => drawer !== id));
      return;
    }
    onToggleDrawer((list) => list.concat(id));
  };

  return (
    <div className={styles.sidebar}>
      {drawerSlot.toArray().map(([id, drawer]) => {
        if (!drawer || !drawer.name) return null;
        return (
          <DrawerUI
            isOpen={openDrawerList.includes(id)}
            onToggle={() => handleDrawerToggle(id)}
            key={id}
            drawer={drawer}
          />
        );
      })}
    </div>
  );
}
