import { ReactElement, createContext } from 'react';
import { TreeNodeProps } from './tree-types';
import { DefaultTreeNode } from './default-tree-node';

export type TreeNodeRenderer<Payload = any> = (props: TreeNodeProps<Payload>) => ReactElement;

export const TreeNodeContext = createContext<TreeNodeRenderer>(DefaultTreeNode);
