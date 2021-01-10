import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { FolderTreeNode } from '@teambit/ui.tree.folder-tree-node';
import { getFileIcon } from '@teambit/ui.utils.get-file-icon';
import { FileTree } from './file-tree';

const currentFile = 'index.ts';
const fileTree = ['folder/file.tsx', 'folder/index.ts'];

function TreeNode(props: any) {
  const children = props.node.children;
  if (!children) {
    return (
      <div style={{ padding: '20px', display: 'flex' }}>
        <img style={{ width: '20px', marginRight: '10px' }} src={getFileIcon(undefined, props.node.id)} />
        <span>{props.node.id}</span>
      </div>
    );
  }
  return <FolderTreeNode {...props} />;
}

export const FileTreeEXample = () => {
  return (
    <ThemeCompositions>
      <div
        style={{
          height: '100px',
          width: '200px',
          padding: '20px',
          display: 'flex',
        }}
      >
        <FileTree TreeNode={TreeNode} files={fileTree || ['']} selected={currentFile} />
      </div>
    </ThemeCompositions>
  );
};

FileTreeEXample.canvas = {
  height: 200,
};
