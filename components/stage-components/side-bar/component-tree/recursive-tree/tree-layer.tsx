import React, { useContext } from 'react';

import { TreeNodeContext } from './tree-node-context';
import { TreeLayerProps } from './tree-types';

export function TreeLayer<Payload = any>({ childNodes, depth }: TreeLayerProps<Payload>) {
  const TreeNodeRenderer = useContext(TreeNodeContext);

  return (
    <>
      {childNodes.map((node) => (
        <TreeNodeRenderer key={node.id} node={node} depth={depth + 1} />
      ))}
    </>
  );
}
