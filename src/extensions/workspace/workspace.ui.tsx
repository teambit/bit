import React, { FC } from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { RouteProps } from 'react-router-dom';
import { Workspace } from './ui';

export type MenuItem = {
  label: JSX.Element | string | null;
};

export type PageRoute = RouteProps;

export type TopBarSlotRegistry = SlotRegistry<MenuItem>;
export type PageSlotRegistry = SlotRegistry<RouteProps>;

export class WorkspaceUI {
  constructor(private topBarSlot: TopBarSlotRegistry, private pageSlot: PageSlotRegistry) {}

  setStage?: React.Dispatch<React.SetStateAction<JSX.Element | undefined>>;

  /**
   * register a new menu item.
   */
  registerMenuItem(menuItem: MenuItem) {
    this.topBarSlot.register(menuItem);
    return this;
  }

  registerPage(pageRoute: PageRoute) {
    this.pageSlot.register(pageRoute);
    return this;
  }

  /** set content to appear in main stage */
  open(element: JSX.Element) {
    this.setStage && this.setStage(element);
  }

  getMain(): FC {
    const WorkspaceUi = () => {
      return <Workspace topBarSlot={this.topBarSlot} pageSlot={this.pageSlot} />;
    };

    return WorkspaceUi;
  }

  static slots = [Slot.withType<MenuItem>(), Slot.withType<JSX.Element>()];

  static async provider(deps, config, [topBarSlot, pageSlot]: [TopBarSlotRegistry, PageSlotRegistry]) {
    return new WorkspaceUI(topBarSlot, pageSlot);
  }
}
