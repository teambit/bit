import React from 'react';
import { RouteSlot, SlotRouter } from '../../react-router/slot-router';
import styles from './top-bar.module.scss';

export type TopBarProps = {
  /**
   * top left corner of the top bar.
   */
  Corner: React.ComponentType;

  /**
   * slot for registering menus to the top-bar.
   */
  menu: RouteSlot;
};

/**
 * Top bar with corner and contextual menu.
 */
export function TopBar({ Corner, menu }: TopBarProps) {
  return (
    <div className={styles.topbar}>
      <Corner />
      <SlotRouter slot={menu} />
    </div>
  );
}
