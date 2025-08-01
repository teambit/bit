import type { ComponentModel } from '@teambit/component';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import type { ComponentType } from 'react';
import React from 'react';

import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { SidebarAspect } from './sidebar.aspect';
import type { SideBarProps } from './ui';
import { SideBar } from './ui';

export type ComponentTypeProps = {
  component: ComponentModel;
};

export type SidebarItem = {
  weight?: number;
  component?: ComponentType;
};

export type SidebarItemSlot = SlotRegistry<SidebarItem[]>;

export type DrawerSlot = SlotRegistry<DrawerType[]>;

export class SidebarUI {
  constructor(private drawerSlot: DrawerSlot) {}

  /**
   * register a new drawer into the component sidebar.
   */
  registerDrawer(...drawer: DrawerType[]) {
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

  static slots = [Slot.withType<DrawerType>()];

  static dependencies = [];

  static async provider(deps, config, [drawerSlot]: [DrawerSlot]) {
    return new SidebarUI(drawerSlot);
  }
}

SidebarAspect.addRuntime(SidebarUI);
