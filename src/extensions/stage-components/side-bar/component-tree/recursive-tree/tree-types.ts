import { ComponentType } from 'react';

export type treeNodeComponentProvider = (node: TreeNode) => ComponentType<TreeNodeProps>;

export type TreeLayerProps = {
  childNodes: TreeNode[];
  depth: number;
};

export type TreeNodeProps = {
  node: TreeNode;
  depth: number;
};

export type TreeNode = {
  id: string;
  children?: TreeNode[];
  // payload: T;
};
