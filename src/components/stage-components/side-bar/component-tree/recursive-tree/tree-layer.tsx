import React, { useContext } from 'react';
import { TreeLayerProps } from './tree-types';
import { TreeNodeContext } from './tree-node-context';

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
