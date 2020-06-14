import React, { ReactNode } from 'react';
import { TopBarSlotRegistry } from '../../workspace.ui';

export type TopBarProps = {
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
export function TopBar({ topBarSlot, onStageSelect }: TopBarProps) {
  const menuItems = topBarSlot.values();
  return (
    <ul>
      {menuItems.map((menuItem, key) => (
        <li key={key} onClick={() => onStageSelect(menuItem.getContent())}>
          {menuItem.label}
        </li>
      ))}
    </ul>
  );
}
