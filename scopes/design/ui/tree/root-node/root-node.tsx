import React, { useContext } from 'react';

// import { TreeNodeProps, TreeNodeContext } from '../recursive-tree';

import {
  TreeNodeContext,
  TreeNodeProps /* , TreeNodeRenderer, TreeNode as TreeNodeType */,
} from '@teambit/base-ui.graph.tree.recursive-tree';

export function RootNode<T>({ node, depth = 0 }: TreeNodeProps<T>) {
  const TreeNodeRenderer = useContext(TreeNodeContext);

  if (node.id) {
    return <TreeNodeRenderer node={node} depth={depth} />;
  }

  if (!node.children) return null;

  return (
    <>
      {node.children.map((rootNode) => (
        <RootNode key={rootNode.id} node={rootNode} depth={depth} />
      ))}
    </>
  );
}
