import { ComponentModel } from '@teambit/component';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import React, { ComponentType } from 'react';

import { Drawer } from './drawer';
import { SidebarAspect } from './sidebar.aspect';
import { SideBar } from './ui';

export type ComponentTypeProps = {
  component: ComponentModel;
};

export type SidebarLink = ComponentType;

export type LinkSlot = SlotRegistry<SidebarLink[]>;

export type DrawerSlot = SlotRegistry<Drawer>;

export class SidebarUI {
  constructor(private drawerSlot: DrawerSlot, private linkSlot: LinkSlot) {}

  /**
   * register a new drawer into the component sidebar.
   */
  registerDrawer(drawer: Drawer) {
    this.drawerSlot.register(drawer);
    return this;
  }

  /**
   * register a new drawer directly into the sidebar.
   */
  registerLink(...links: SidebarLink[]) {
    this.linkSlot.register(links);
    return this;
  }

  /**
   * render the sidebar.
   */
  render = (props) => {
    return <SideBar {...props} drawerSlot={this.drawerSlot} linkSlot={props.linkSlot}></SideBar>;
  };

  static runtime = UIRuntime;

  static slots = [Slot.withType<Drawer>(), Slot.withType<SidebarLink>()];

  static dependencies = [];

  static async provider(deps, config, [drawerSlot, linkSlot]: [DrawerSlot, LinkSlot]) {
    return new SidebarUI(drawerSlot, linkSlot);
  }
}

SidebarAspect.addRuntime(SidebarUI);
