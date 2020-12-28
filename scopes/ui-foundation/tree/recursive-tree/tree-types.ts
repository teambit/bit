import { ComponentType } from 'react';
// import { PayloadType } from '../payload-type';

export type treeNodeComponentProvider = (node: TreeNode) => ComponentType<TreeNodeProps>;

export type TreeLayerProps<Payload = any> = {
  childNodes: TreeNode<Payload>[];
  depth: number;
};

export type TreeNodeProps<Payload = any> = {
  node: TreeNode<Payload>;
  depth: number;
  TreeNode?: TreeNodeProps<any>; // TODO - figure out what type we would like to place here used to be PayloadType
};

export type TreeNode<Payload = any> = {
  id: string;
  children?: TreeNode<Payload>[];
  payload?: Payload;
};

export type StatusTypes = 'modified' | 'error' | 'new' | 'staged';
