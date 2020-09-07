import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';

import { ComponentTreeNode } from './component-tree-node';
import { ComponentTreeAspect } from './component-tree.aspect';

export type ComponentTreeSlot = SlotRegistry<ComponentTreeNode>;

export class ComponentTreeUI {
  constructor(private treeNodeSlot: ComponentTreeSlot) {}

  registerTreeNode(treeNode: ComponentTreeNode) {
    this.treeNodeSlot.register(treeNode);
    return this;
  }

  static runtime = UIRuntime;

  static slots = [Slot.withType<ComponentTreeNode>()];

  static dependencies = [];

  static async provider(deps, config, [treeNodeSlot]: [ComponentTreeSlot]) {
    return new ComponentTreeUI(treeNodeSlot);
  }
}

ComponentTreeAspect.addRuntime(ComponentTreeUI);
