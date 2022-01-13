import { ComponentType } from 'react';

export type treeNodeComponentProvider = (node: TreeNode) => ComponentType<TreeNodeProps>;

export type TreeLayerProps<Payload = any> = {
  childNodes: TreeNode<Payload>[];
  depth: number;
};

export type TreeNodeProps<Payload = any> = {
  node: TreeNode<Payload>;
  isActive?: boolean;
  isOpen?: boolean;
  depth: number;
  TreeNode?: TreeNodeProps<Payload>;
};

export type TreeNode<Payload = any> = {
  id: string;
  children?: TreeNode<Payload>[];
  payload?: Payload;
};
