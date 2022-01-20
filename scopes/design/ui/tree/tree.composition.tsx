import React from 'react';
import { Tree } from './tree';
import { DefaultTreeNode } from './recursive-tree';
import { basicTreeMock } from './tree.mock';

export const BasicTree = () => <Tree tree={basicTreeMock} TreeNode={DefaultTreeNode} />;
