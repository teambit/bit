import React, { useContext } from 'react';

import { PayloadType } from '../payload-type';
import { TreeNodeProps, TreeNodeContext } from '../recursive-tree';

export function RootNode({ node, depth = 0 }: TreeNodeProps<PayloadType>) {
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
