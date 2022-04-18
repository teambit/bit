import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';

import { FolderTreeNode } from './folder-tree-node';

const nodeCollapsed = {
  id: 'folder-example',
  payload: {
    open: false,
  },
  children: [
    { id: 'child1', children: undefined },
    { id: 'child2', children: undefined },
  ],
};

const nodeWithImg = {
  id: 'folder-example',
  payload: {
    icon: 'https://static.bit.dev/bit-logo.svg',
  },
  children: [
    { id: 'child1', children: undefined },
    { id: 'child2', children: undefined },
  ],
};
const nodeWithIcon = {
  id: 'folder-example',
  payload: {
    icon: 'workspace',
  },
  children: [
    { id: 'child1', children: undefined },
    { id: 'child2', children: undefined },
  ],
};

const nodeWithCustomIcon = {
  id: 'folder-example',
  payload: {
    icon: (
      <img
        style={{ width: 16, marginRight: 8 }}
        src="https://bitsrc.imgix.net/bf5970b9b97dfb045867dd2842eaefd1e623e328.png?size=35&w=70&h=70&crop=faces&fit=crop&bg=fff"
      />
    ),
  },
  children: [
    { id: 'child1', children: undefined },
    { id: 'child2', children: undefined },
  ],
};

const node = {
  id: 'folder-example',
  children: [
    { id: 'child1', children: undefined },
    { id: 'child2', children: undefined },
  ],
};
export const FolderNodeExample = () => {
  return (
    <ThemeCompositions>
      <FolderTreeNode node={node} depth={2} />
    </ThemeCompositions>
  );
};

export const FolderNodeCollapsed = () => {
  return (
    <ThemeCompositions>
      <FolderTreeNode node={nodeCollapsed} depth={2} />
    </ThemeCompositions>
  );
};

export const FolderNodeWithImage = () => {
  return (
    <ThemeCompositions>
      <FolderTreeNode node={nodeWithImg} depth={2} />
    </ThemeCompositions>
  );
};

export const FolderNodeWithIcon = () => {
  return (
    <ThemeCompositions>
      <FolderTreeNode node={nodeWithIcon} depth={2} />
    </ThemeCompositions>
  );
};

export const FolderNodeWithCustomIcon = () => {
  return (
    <ThemeCompositions>
      <FolderTreeNode node={nodeWithCustomIcon} depth={2} />
    </ThemeCompositions>
  );
};

FolderNodeExample.canvas = {
  height: 200,
};
