import React from 'react';
import { TopBarSlotRegistry } from '../../workspace.ui';

export type TopBarProps = {
  topBarSlot: TopBarSlotRegistry;
};

export function TopBar({ topBarSlot }: TopBarProps) {
  const menuItems = topBarSlot.values();
  return (
    <ul>
      {menuItems.map((menuItem, key) => (
        <li key={key}>{menuItem.label}</li>
      ))}
    </ul>
  );
}
