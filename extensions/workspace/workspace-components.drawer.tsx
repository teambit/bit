import { Drawer } from '@teambit/sidebar';
import { FullLoader } from '@teambit/staged-components.full-loader';
import { ComponentTree } from '@teambit/staged-components.side-bar';
import React from 'react';
import { ComponentTreeSlot } from '@teambit/component-tree';
import { useWorkspace } from './ui/workspace/use-workspace';

export class WorkspaceComponentsDrawer implements Drawer {
  constructor(private treeNodeSlot: ComponentTreeSlot) {}

  name = 'COMPONENTS';

  render = () => {
    const workspace = useWorkspace();

    if (!workspace) return <FullLoader />;
    return <ComponentTree showScopeDrawer={true} components={workspace.components} treeNodeSlot={this.treeNodeSlot} />;
  };
}
