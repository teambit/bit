import type { DrawerType } from '@teambit/ui.tree.drawer';
import { FullLoader } from '@teambit/ui.full-loader';
import {
  ComponentTree,
  PayloadType,
  ComponentView,
  ScopeTreeNode,
  NamespaceTreeNode,
  ScopePayload,
} from '@teambit/ui.side-bar';

import type { TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';

import React, { useCallback, useContext } from 'react';
import { ComponentTreeSlot } from '@teambit/component-tree';
import { mutedItalic } from '@teambit/ui.styles.muted-italic';
import { WorkspaceContext } from './ui/workspace/workspace-context';

export class WorkspaceComponentsDrawer implements DrawerType {
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
    if (!workspace.components) return <span className={mutedItalic}>Workspace is empty</span>;
    return <ComponentTree components={workspace.components} TreeNode={TreeNodeRenderer} />;
  };
}
