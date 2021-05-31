import React, { useCallback } from 'react';
import classNames from 'classnames';
import {
  ComponentTree,
  ComponentView,
  NamespaceTreeNode,
  PayloadType,
  ScopePayload,
} from '@teambit/ui-foundation.ui.side-bar';
import { TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';

import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import { ComponentTreeSlot } from '@teambit/component-tree';
import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { Text } from '@teambit/base-ui.text.text';
import { mutedItalic } from '@teambit/design.ui.styles.muted-italic';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { useScope } from '../use-scope';
import styles from './components-drawer.module.scss';

export class ComponentsDrawer implements DrawerType {
  constructor(private treeNodeSlot: ComponentTreeSlot) {}

  name = 'COMPONENTS';

  render = () => {
    const { scope } = useScope();
    const { treeNodeSlot } = this;

    const TreeNodeRenderer = useCallback(
      function TreeNode(props: TreeNodeProps<PayloadType>) {
        const children = props.node.children;

        if (!children) return <ComponentView {...props} treeNodeSlot={treeNodeSlot} />;

        // skip over scope node and render only children
        if (props.node.payload instanceof ScopePayload) {
          return (
            <>
              {children.map((childNode) => (
                <TreeNodeRenderer key={childNode.id} {...props} node={childNode}></TreeNodeRenderer>
              ))}
            </>
          );
        }

        return <NamespaceTreeNode {...props} />;
      },
      [treeNodeSlot]
    );

    if (!scope) return <FullLoader />;
    if (scope.components.length === 0)
      return <Text className={classNames(mutedItalic, ellipsis, styles.emptyScope)}>Scope is empty</Text>;
    return <ComponentTree components={scope.components} TreeNode={TreeNodeRenderer} />;
  };
}
