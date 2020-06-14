import React from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { Workspace } from './ui';

export type MenuItem = {
  label: string;
  onClick: () => void;
};

export type TopBarSlotRegistry = SlotRegistry<MenuItem>;

export class WorkspaceUI {
  constructor(private topBarSlot: TopBarSlotRegistry) {}

  /**
   * register a new menu item.
   */
  registerMenuItem(menuItem: MenuItem) {
    this.topBarSlot.register(menuItem);
    return this;
  }

  getMain(): JSX.Element {
    return <Workspace topBarSlot={this.topBarSlot} />;
  }

  static slots = [Slot.withType<MenuItem>()];

  static async provider(deps, config, [topBarSlot]: [TopBarSlotRegistry]) {
    return new WorkspaceUI(topBarSlot);
  }
}
