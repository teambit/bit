import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import {
  ComponentTree,
  PayloadType,
  ComponentView,
  ScopeTreeNode,
  NamespaceTreeNode,
  ScopePayload,
} from '@teambit/ui-foundation.ui.side-bar';

import type { TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';

import React, { useCallback, useContext } from 'react';
import classNames from 'classnames';
import { ComponentTreeSlot } from '@teambit/component-tree';
import { Text } from '@teambit/base-ui.text.text';
import { mutedItalic } from '@teambit/design.ui.styles.muted-italic';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { WorkspaceContext } from '../workspace/workspace-context';
import styles from './workspace-components-drawer.module.scss';

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
    if (workspace.components.length === 0)
      return <Text className={classNames(mutedItalic, ellipsis, styles.emptyWorkspace)}>Workspace is empty</Text>;
    return <ComponentTree components={workspace.components} TreeNode={TreeNodeRenderer} />;
  };
}
