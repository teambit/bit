import React from 'react';
import classnames from 'classnames';

import { TopBarSlotRegistry } from '../../workspace.ui';
import styles from './top-bar.module.scss';

export type TopBarProps = {
  className?: string;
  /**
   * slot for top bar menu items
   */
  topBarSlot: TopBarSlotRegistry;
  currentTag: {
    version: string;
    downloads: number;
    likes: number;
  };
};

/**
 * top bar menu.
 */
export function TopBar({ topBarSlot, className, currentTag }: TopBarProps) {
  const menuItems = topBarSlot.values();

  return (
    <div className={classnames(styles.topBar, className)}>
      <ul className={styles.navigation}>
        {menuItems.map((menuItem, key) => (
          <li key={key} onClick={menuItem.onClick}>
            {menuItem.label}
          </li>
        ))}
      </ul>
      <div className={styles.rightSide}>
        <span>🔖 {currentTag.version}</span>
        <span>⬇️ {currentTag.downloads}</span>
        <span>♡ {currentTag.likes}</span>
        <span>|</span>
        <button>import ▾</button>
        <button>simulations</button>
        <button>code</button>
      </div>
    </div>
  );
}
