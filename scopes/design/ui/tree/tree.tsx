import React from 'react';
import { TreeNodeContext } from './recursive-tree';
import { TreeProvider } from './tree-context';
import type { TreeNode as TreeNodeType, TreeNodeRenderer } from './recursive-tree';
import type { TreeContextType } from './tree-context';
import { RootNode } from './root-node';

export type TreeProps = {
  TreeNode: TreeNodeRenderer<any>;
  tree: TreeNodeType;
  depth?: number;
} & React.HTMLAttributes<HTMLDivElement> &
  TreeContextType;

export function Tree({
  TreeNode,
  tree,
  activePath,
  setActivePath,
  isCollapsed,
  setIsCollapsed,
  depth = 1,
  ...rest
}: TreeProps) {
  return (
    <TreeProvider
      activePath={activePath}
      setActivePath={setActivePath}
      isCollapsed={isCollapsed}
      setIsCollapsed={setIsCollapsed}
    >
      <TreeNodeContext.Provider value={TreeNode}>
        <RootNode {...rest} node={tree} depth={depth} />
      </TreeNodeContext.Provider>
    </TreeProvider>
  );
}
