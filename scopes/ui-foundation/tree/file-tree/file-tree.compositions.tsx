import React, { useState } from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { FolderTreeNode } from '@teambit/ui-foundation.ui.tree.folder-tree-node';
import { getFileIcon } from '@teambit/code.ui.utils.get-file-icon';
import { TreeNode as Node } from '@teambit/ui-foundation.ui.tree.tree-node';
import { FileTree } from './file-tree';

const currentFile = 'index.ts';
const fileTree = ['folder/file.tsx', 'folder/file.module.scss', 'folder/index.ts'];

export const FileTreeEXample = () => {
  const [active, setToActive] = useState('folder/index.ts');

  function TreeNode(props: any) {
    const children = props.node.children;
    if (!children) {
      return (
        <Node
          onClick={() => setToActive(props.node.id)}
          isActive={props.node.id === active}
          icon={getFileIcon(undefined, props.node.id) || ''}
          node={{ id: props.node.id }}
          depth={1}
          href="#"
        />
      );
    }
    return <FolderTreeNode {...props} />;
  }
  return (
    <ThemeCompositions>
      <FileTree
        style={{
          height: '100px',
          width: '200px',
          padding: '20px',
          display: 'flex',
        }}
        TreeNode={TreeNode}
        files={fileTree || ['']}
        selected={currentFile}
      />
    </ThemeCompositions>
  );
};

FileTreeEXample.canvas = {
  height: 200,
};
