import React, { useContext } from 'react';

import { PayloadType } from '../payload-type';
import { TreeNode, TreeNodeContext } from '../recursive-tree';

export function RootNode({ node }: { node: TreeNode<PayloadType> }) {
  const TreeNodeRenderer = useContext(TreeNodeContext);

  if (node.id) {
    return <TreeNodeRenderer node={node} depth={0} />;
  }

  if (!node.children) return null;

  return (
    <>
      {node.children.map((rootNode) => (
        <RootNode key={rootNode.id} node={rootNode} />
      ))}
    </>
  );
}
