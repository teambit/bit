import { ComponentModel } from '@teambit/component';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import React, { ComponentType } from 'react';

import { Drawer } from './drawer';
import { SidebarAspect } from './sidebar.aspect';
import { SideBar, SideBarProps } from './ui';

export type ComponentTypeProps = {
  component: ComponentModel;
};

export type SidebarItem = ComponentType;

export type SidebarItemSlot = SlotRegistry<SidebarItem[]>;

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
  render = (props: Partial<SideBarProps>) => {
    return <SideBar drawerSlot={this.drawerSlot} {...props}></SideBar>;
  };

  static runtime = UIRuntime;

  static slots = [Slot.withType<Drawer>()];

  static dependencies = [];

  static async provider(deps, config, [drawerSlot]: [DrawerSlot]) {
    return new SidebarUI(drawerSlot);
  }
}

SidebarAspect.addRuntime(SidebarUI);
