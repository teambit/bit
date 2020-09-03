import React from 'react';

import { indentClass, indentStyle } from '../indent';
import { TreeLayer } from './tree-layer';
import { TreeNodeProps } from './tree-types';

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
