import React from 'react';
import { DrawerSlot } from './sidebar.ui';

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
  return (
    <div>
      {drawerSlot.toArray().map(([id, drawer]) => {
        return (
          <div key={id}>
            <div>{drawer.name}</div>
            <drawer.component />
          </div>
        );
      })}
    </div>
  );
}
