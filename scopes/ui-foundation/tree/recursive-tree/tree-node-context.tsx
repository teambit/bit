import { createContext, ReactElement } from 'react';

import { DefaultTreeNode } from './default-tree-node';
import { TreeNodeProps } from './tree-types';

export type TreeNodeRenderer<Payload = any> = (props: TreeNodeProps<Payload>) => ReactElement;

export const TreeNodeContext: React.Context<TreeNodeRenderer<any>> = createContext<TreeNodeRenderer>(DefaultTreeNode);
