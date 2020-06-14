import { ComponentType } from 'react';

export type treeNodeComponentProvider = (node: TreeNode) => ComponentType<TreeNodeProps>;

export type TreeLayerProps = {
  childNodes: TreeNode[];
  depth: number;
  //TODO - consider passing as an object
  // getTreeNodeComponent: treeNodeComponentProvider;
};

export type TreeNodeProps = {
  node: TreeNode;
  depth: number;
  // getTreeNodeComponent: treeNodeComponentProvider;
};

export type TreeNode = {
  id: string;
  children?: TreeNode[];
  // payload: T;
};
