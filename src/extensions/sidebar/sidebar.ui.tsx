import React from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { ComponentModel } from '../component/ui';
import { SideBar, Drawer } from './ui';

export type ComponentTypeProps = {
  component: ComponentModel;
};

export type DrawerSlot = SlotRegistry<Drawer>;

export class SidebarUI {
  constructor(private drawerSlot: DrawerSlot) {}

  /**
   * register a new drawer into the component sidebar.
   */
  registerDrawer(drawer: Drawer) {
    this.drawerSlot.register(drawer);
    return this;
  }

  /**
   * render the sidebar.
   */
  render = () => {
    return <SideBar drawerSlot={this.drawerSlot}></SideBar>;
  };

  static slots = [Slot.withType<Drawer>()];

  static dependencies = [];

  static async provider(deps, config, [drawerSlot]: [DrawerSlot]) {
    return new SidebarUI(drawerSlot);
  }
}
