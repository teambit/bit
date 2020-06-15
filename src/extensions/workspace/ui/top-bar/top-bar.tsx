import React, { ReactNode } from 'react';
import classnames from 'classnames';
import { TopBarSlotRegistry } from '../../workspace.ui';
import styles from './top-bar.module.scss';

export type TopBarProps = {
  className?: string;
  /**
   * slot for top bar menu items
   */
  topBarSlot: TopBarSlotRegistry;
};

/**
 * top bar menu.
 */
export function TopBar({ topBarSlot, className }: TopBarProps) {
  const menuItems = topBarSlot.values();
  return (
    <ul className={classnames(styles.topBar, className)}>
      {menuItems.map((menuItem, key) => (
        <li key={key} onClick={menuItem.onClick}>
          {menuItem.label}
        </li>
      ))}
    </ul>
  );
}
