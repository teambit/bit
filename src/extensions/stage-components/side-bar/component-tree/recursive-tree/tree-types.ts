import { ComponentType } from 'react';

export type treeNodeComponentProvider = (node: TreeNode) => ComponentType<TreeNodeProps>;

export type TreeLayerProps = {
  childNodes: TreeNode[];
  depth: number;
};

export type TreeNodeProps = {
  node: TreeNode;
  depth: number;
  status?: StatusTypes;
};

export type TreeNode = {
  id: string;
  children?: TreeNode[];
  status?: StatusTypes;
  // payload: T;
};

export type StatusTypes = 'modified' | 'error' | 'new' | 'staged';
