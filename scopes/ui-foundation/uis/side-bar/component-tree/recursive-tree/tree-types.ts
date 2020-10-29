import { ComponentType } from 'react';
import { PayloadType } from '../payload-type';

export type treeNodeComponentProvider = (node: TreeNode) => ComponentType<TreeNodeProps>;

export type TreeLayerProps<Payload = any> = {
  childNodes: TreeNode<Payload>[];
  depth: number;
};

export type TreeNodeProps<Payload = any> = {
  node: TreeNode<Payload>;
  depth: number;
  TreeNode?: TreeNodeProps<PayloadType>;
};

export type TreeNode<Payload = any> = {
  id: string;
  children?: TreeNode<Payload>[];
  payload?: Payload;
};

export type StatusTypes = 'modified' | 'error' | 'new' | 'staged';
