import { Drawer } from '@teambit/sidebar';
import { FullLoader } from '@teambit/ui.full-loader';
import {
  ComponentTree,
  TreeNodeProps,
  PayloadType,
  ComponentView,
  ScopeTreeNode,
  NamespaceTreeNode,
  ScopePayload,
} from '@teambit/ui.side-bar';

import React, { useCallback } from 'react';
import { ComponentTreeSlot } from '@teambit/component-tree';
import { useWorkspace } from './ui/workspace/use-workspace';

export class WorkspaceComponentsDrawer implements Drawer {
  constructor(private treeNodeSlot: ComponentTreeSlot) {}

  name = 'COMPONENTS';

  render = () => {
    const workspace = useWorkspace();
    const { treeNodeSlot } = this;

    const TreeNodeRenderer = useCallback(
      function TreeNode(props: TreeNodeProps<PayloadType>) {
        const children = props.node.children;

        if (!children) return <ComponentView {...props} treeNodeSlot={treeNodeSlot} />;

        if (props.node.payload instanceof ScopePayload) return <ScopeTreeNode {...props} />;

        return <NamespaceTreeNode {...props} />;
      },
      [treeNodeSlot]
    );

    if (!workspace) return <FullLoader />;
    return <ComponentTree components={workspace.components} TreeNode={TreeNodeRenderer} />;
  };
}
