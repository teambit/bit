import React from 'react';
import { TreeNodeProps } from './tree-types';
import { TreeLayer } from './tree-layer';
import { indentClass, indentStyle } from '../indent';

export function DefaultTreeNode({ node, depth }: TreeNodeProps) {
  if (!node.children) {
    return <div className={indentClass}>{node.id}</div>;
  }

  return (
    <>
      <div className={indentClass}>{node.id}</div>

      <div style={indentStyle(depth + 1)}>
        <TreeLayer childNodes={node.children} depth={depth} />
      </div>
    </>
  );
}
