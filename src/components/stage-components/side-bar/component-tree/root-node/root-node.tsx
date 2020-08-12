import React, { useContext } from 'react';
import { TreeNodeContext, TreeNode } from '../recursive-tree';
import { PayloadType } from '../payload-type';

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
