import React, { useCallback } from 'react';
import { ComponentTree, ComponentView, NamespaceTreeNode, PayloadType, ScopePayload } from '@teambit/ui.side-bar';
import { TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';

import { FullLoader } from '@teambit/ui.full-loader';
import { ComponentTreeSlot } from '@teambit/component-tree';
import { Drawer } from '@teambit/sidebar';
import { useScope } from './ui/use-scope';

export class ComponentsDrawer implements Drawer {
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
    return <ComponentTree components={scope.components} TreeNode={TreeNodeRenderer} />;
  };
}
