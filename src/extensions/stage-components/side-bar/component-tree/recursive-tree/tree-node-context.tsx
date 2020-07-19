import { createContext, ComponentType } from 'react';
import { TreeNode, TreeNodeProps } from './tree-types';
import { DefaultTreeNode } from './default-tree-node';

type TreeNodeResolver = (node: TreeNode) => ComponentType<TreeNodeProps>;

export const TreeNodeContext = createContext<TreeNodeResolver>(() => DefaultTreeNode);
