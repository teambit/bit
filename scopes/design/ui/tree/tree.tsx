import React from 'react';
import { TreeNodeContext } from './recursive-tree';
import type { TreeNode as TreeNodeType, TreeNodeRenderer } from './recursive-tree';
import { RootNode } from './root-node';

export type TreeProps = {
  TreeNode: TreeNodeRenderer<any>;
  tree: TreeNodeType;
} & React.HTMLAttributes<HTMLDivElement>;

export function Tree({ TreeNode, tree, ...rest }: TreeProps) {
  return (
    <TreeNodeContext.Provider value={TreeNode}>
      <RootNode {...rest} node={tree} depth={1} />
    </TreeNodeContext.Provider>
  );
}
