import React, { useContext } from 'react';

import { TreeNodeProps, TreeNodeContext } from '@teambit/base-ui.graph.tree.recursive-tree';

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
