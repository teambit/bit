import { createContext, ComponentType } from 'react';
import { TreeNode, TreeNodeProps } from './tree-types';
import { DefaultTreeNode } from './default-tree-node';

export type TreeNodeResolver<Payload = any> = (node: TreeNode<Payload>) => ComponentType<TreeNodeProps>;

export const TreeNodeContext = createContext<TreeNodeResolver>(() => DefaultTreeNode);
