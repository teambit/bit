import React, { FC, useState } from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { Workspace } from './ui';

export type MenuItem = {
  label: string;
  onClick?: () => any;
  // getContent?: () => JSX.Element;
};

export type TopBarSlotRegistry = SlotRegistry<MenuItem>;
export type StageSlotRegistry = SlotRegistry<JSX.Element>;

export class WorkspaceUI {
  constructor(private topBarSlot: TopBarSlotRegistry, private stageSlot: StageSlotRegistry) {}
  setStage?: React.Dispatch<React.SetStateAction<JSX.Element | undefined>>;

  /**
   * register a new menu item.
   */
  registerMenuItem(menuItem: MenuItem) {
    this.topBarSlot.register(menuItem);
    return this;
  }

  /** set content to appear in main stage */
  open(element: JSX.Element) {
    this.setStage && this.setStage(element);
  }

  getMain(): FC {
    const WorkspaceUi = () => {
      const [stage, setStage] = useState<JSX.Element | undefined>(undefined);
      this.setStage = setStage;

      return <Workspace topBarSlot={this.topBarSlot} stage={stage} />;
    };

    return WorkspaceUi;
  }

  static slots = [Slot.withType<MenuItem>(), Slot.withType<JSX.Element>()];

  static async provider(deps, config, [topBarSlot, stageSlot]: [TopBarSlotRegistry, StageSlotRegistry]) {
    return new WorkspaceUI(topBarSlot, stageSlot);
  }
}
