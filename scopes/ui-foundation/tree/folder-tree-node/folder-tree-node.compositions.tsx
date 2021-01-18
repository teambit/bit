import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';

import { FolderTreeNode } from './folder-tree-node';

const node = {
  id: 'folder-example',
  children: [
    { id: 'child1', children: undefined },
    { id: 'child2', children: undefined },
  ],
};
export const FolderNodeEample = () => {
  return (
    <ThemeCompositions>
      <FolderTreeNode node={node} depth={2} />
    </ThemeCompositions>
  );
};

FolderNodeEample.canvas = {
  height: 200,
};
