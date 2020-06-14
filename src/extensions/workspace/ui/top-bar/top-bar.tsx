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

  /**
   * on select stage event.
   */
  onStageSelect: (stage: JSX.Element) => void;
};

/**
 * top bar menu.
 */
export function TopBar({ topBarSlot, className, onStageSelect }: TopBarProps) {
  const menuItems = topBarSlot.values();
  return (
    <ul className={classnames(styles.topBar, className)}>
      {menuItems.map((menuItem, key) => (
        <li key={key} onClick={() => onStageSelect(menuItem.getContent())}>
          {menuItem.label}
        </li>
      ))}
    </ul>
  );
}
