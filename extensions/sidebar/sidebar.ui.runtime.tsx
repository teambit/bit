import React from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import { ComponentModel } from '@teambit/component';
import { SideBar } from './ui';
import { Drawer } from './drawer';
import { SidebarAspect } from './sidebar.aspect';

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

  static runtime = UIRuntime;

  static slots = [Slot.withType<Drawer>()];

  static dependencies = [];

  static async provider(deps, config, [drawerSlot]: [DrawerSlot]) {
    return new SidebarUI(drawerSlot);
  }
}

SidebarAspect.addRuntime(SidebarUI);
