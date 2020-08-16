import React from 'react';
import { Slot } from '@teambit/harmony';
import { Drawer } from '../../sidebar/ui';
import { ComponentTree } from '../../../components/stage-components/side-bar/component-tree';
import { useComponentHost } from '../host/use-component-host';
import { FullLoader } from '../../../to-eject/full-loader';
import { ComponentTreeSlot } from '../../component-tree/component-tree.ui';
import { SidebarUI } from '../../sidebar/sidebar.ui';
import { ComponentTreeNode } from '../../component-tree';

export class ExternalComponentTreeDrawer implements Drawer {
  constructor(private treeNodeSlot: ComponentTreeSlot) {}
  name = 'EXTERNAL COMPONENTS';

  component = () => {
    const { host } = useComponentHost();
    if (!host) return <FullLoader />;
    // TODO - remove hard coded filter
    const components = host.components.filter((x) => x.id.legacyComponentId.scope !== 'teambit2.documenter-temp');
    return <ComponentTree components={components} treeNodeSlot={this.treeNodeSlot} />;
  };
  registerTreeNode(treeNode: ComponentTreeNode) {
    this.treeNodeSlot.register(treeNode);
    return this;
  }
  static slots = [Slot.withType<ComponentTreeNode>()];
  static dependencies = [SidebarUI];
  static async provider([sidebar]: [SidebarUI], config, [treeNodeSlot]: [ComponentTreeSlot]) {
    const drawer = new ExternalComponentTreeDrawer(treeNodeSlot);
    sidebar.registerDrawer(drawer);
    return drawer;
  }
}
