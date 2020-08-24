import { Slot, SlotRegistry } from '@teambit/harmony';
import SidebarAspect, { SidebarUI } from '@teambit/sidebar';
import { UIRuntime } from '@teambit/ui';

import { ComponentTreeNode } from './component-tree-node';
import { ComponentTreeAspect } from './component-tree.aspect';
import { ComponentTreeDrawer } from './component-tree.drawer';

export type ComponentTreeSlot = SlotRegistry<ComponentTreeNode>;

export class ComponentTreeUI {
  constructor(private treeNodeSlot: ComponentTreeSlot) {}

  registerTreeNode(treeNode: ComponentTreeNode) {
    this.treeNodeSlot.register(treeNode);
    return this;
  }

  static runtime = UIRuntime;

  static slots = [Slot.withType<ComponentTreeNode>()];

  static dependencies = [SidebarAspect];

  static async provider([sidebar]: [SidebarUI], config, [treeNodeSlot]: [ComponentTreeSlot]) {
    sidebar.registerDrawer(new ComponentTreeDrawer(treeNodeSlot));
    return new ComponentTreeUI(treeNodeSlot);
  }
}

ComponentTreeAspect.addRuntime(ComponentTreeUI);
