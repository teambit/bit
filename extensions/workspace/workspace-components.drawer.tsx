import { Drawer } from '@teambit/sidebar';
import { FullLoader } from '@teambit/staged-components.full-loader';
import {
  ComponentTree,
  TreeNodeProps,
  PayloadType,
  ComponentView,
  ScopeTreeNode,
  NamespaceTreeNode,
  ScopePayload,
} from '@teambit/staged-components.side-bar';

import React, { useCallback, useContext } from 'react';
import { ComponentTreeSlot } from '@teambit/component-tree';
import { WorkspaceContext } from './ui/workspace/workspace-context';

export class WorkspaceComponentsDrawer implements Drawer {
  constructor(private treeNodeSlot: ComponentTreeSlot) {}

  name = 'COMPONENTS';

  render = () => {
    const workspace = useContext(WorkspaceContext);
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
