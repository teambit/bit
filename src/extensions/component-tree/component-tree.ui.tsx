import { Slot, SlotRegistry } from '@teambit/harmony';
import { ComponentTreeNode } from './component-tree-node';
import { SidebarUI } from '../sidebar/sidebar.ui';
import { ComponentTreeDrawer } from '../component/component-tree';

export type ComponentTreeSlot = SlotRegistry<ComponentTreeNode>;

export class ComponentTreeUI {
  constructor(private treeNodeSlot: ComponentTreeSlot) {}

  registerTreeNode(treeNode: ComponentTreeNode) {
    this.treeNodeSlot.register(treeNode);
    return this;
  }

  static slots = [Slot.withType<ComponentTreeNode>()];

  static dependencies = [SidebarUI];

  static async provider([sidebar]: [SidebarUI], config, [treeNodeSlot]: [ComponentTreeSlot]) {
    sidebar.registerDrawer(new ComponentTreeDrawer(treeNodeSlot));
    return new ComponentTreeUI(treeNodeSlot);
  }
}
