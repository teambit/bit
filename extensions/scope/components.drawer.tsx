import React, { useCallback } from 'react';
import {
  ComponentTree,
  ComponentView,
  NamespaceView,
  PayloadType,
  TreeNodeProps,
} from '@teambit/staged-components.side-bar';
import { FullLoader } from '@teambit/staged-components.full-loader';
import { ComponentTreeSlot } from '@teambit/component-tree';
import { Drawer } from '@teambit/sidebar';
import { useScope } from './ui/use-scope';

const scopeRegEx = /^[\w-]+\.[\w-]+\/$/;

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

        const isScope = scopeRegEx.test(props.node.id);
        if (isScope)
          return (
            <>
              {children.map((childNode) => (
                <TreeNodeRenderer key={childNode.id} {...props} node={childNode}></TreeNodeRenderer>
              ))}
            </>
          );

        return <NamespaceView {...props} />;
      },
      [treeNodeSlot]
    );

    if (!scope) return <FullLoader />;
    return <ComponentTree components={scope.components} TreeNode={TreeNodeRenderer} />;
  };
}
