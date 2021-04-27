import React from 'react';
import { MenuItem } from './item';

export function Preview() {
  return <MenuItem icon="settings">Menu item</MenuItem>;
}

export function Active() {
  return (
    <MenuItem icon="settings" active>
      Active item
    </MenuItem>
  );
}

export function Interactive() {
  return (
    <MenuItem icon="settings" interactive>
      Hoverable item
    </MenuItem>
  );
}
