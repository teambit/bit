import React, { useState } from 'react';
import { flatten } from 'lodash';
import { LinkSection } from '@teambit/sidebar.ui.link-section';
import { DrawerSlot, LinkSlot } from '../../sidebar.ui.runtime';
import { DrawerUI } from '../drawer';
import styles from './side-bar.module.scss';

export type SideBarProps = {
  /**
   * slot of registered drawers.
   */
  drawerSlot: DrawerSlot;

  linkSlot?: LinkSlot;
};

/**
 * side bar component.
 */
export function SideBar({ drawerSlot, linkSlot }: SideBarProps) {
  const [openDrawerList, onToggleDrawer] = useState([drawerSlot.toArray()[0][0]]);

  const links = flatten(linkSlot?.values());
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
      <LinkSection links={links} />
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
