import React, { useState } from 'react';
import { TreeNodeContext } from './recursive-tree';
import type { TreeNode as TreeNodeType, TreeNodeRenderer } from './recursive-tree';
import { RootNode } from './root-node';

export type TreeProps = {
  TreeNode: TreeNodeRenderer<any>;
  tree: TreeNodeType;
  activePath?: string;
  collapseAll?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function Tree({ TreeNode, tree, activePath, className }: TreeProps) {
  // console.log("activePath", activePath)
  return (
    <TreeNodeContext.Provider
      value={(props) => {
        console.log('props!!!', props, activePath);
        return <BaseTreeNode {...props} TreeNode={TreeNode} activePath={activePath} />;
      }}
    >
      <RootNode node={tree} depth={1} />
    </TreeNodeContext.Provider>
  );
}

function BaseTreeNode({ TreeNode, activePath, ...rest }) {
  // console.log("tt", activePath, rest)
  const isOpen = activePath?.includes(rest.node.id);
  return <TreeNode {...rest} isActive={isOpen} isOpen={isOpen} />;
}
