import React, { useState, useCallback, useMemo, HTMLAttributes } from 'react';
import classNames from 'classnames';
import { getIconForFile } from 'vscode-icons-js';
import { FileTree } from '@teambit/tree.file-tree';
import { DrawerUI } from '@teambit/tree.drawer';
import { TreeNode as Node } from '@teambit/tree.tree-node';

import { FolderTreeNode } from '@teambit/tree.folder-tree-node';
import { DependencyTree, Dependencies } from '../dependency-tree';

import styles from './code-tab-tree.module.scss';

export type CodeTabTreeProps = {
  fileTree: any[];
  dependencies?: Dependencies;
  currentFile: string;
} & HTMLAttributes<HTMLDivElement>;

export function CodeTabTree({ className, fileTree, dependencies, currentFile }: CodeTabTreeProps) {
  const [openDrawerList, onToggleDrawer] = useState(['FILES', 'DEPENDENCIES']);

  const handleDrawerToggle = (id: string) => {
    const isDrawerOpen = openDrawerList.includes(id);
    if (isDrawerOpen) {
      onToggleDrawer((list) => list.filter((drawer) => drawer !== id));
      return;
    }
    onToggleDrawer((list) => list.concat(id));
  };

  const TreeNodeRenderer = useCallback(
    function TreeNode(props: any) {
      const children = props.node.children;
      if (!children) return <Node {...props} isActive={props.node.id === currentFile} icon={getIcon(props.node.id)} />;

      return <FolderTreeNode {...props} />;
    },
    [currentFile]
  );

  const fileDrawer = useMemo(() => {
    const Tree = () => <FileTree TreeNode={TreeNodeRenderer} files={fileTree || ['']} />;
    return {
      name: 'FILES',
      render: Tree,
    };
  }, [fileTree, currentFile]);

  const dependencyDrawer = useMemo(() => {
    const Tree = () => <DependencyTree dependencies={dependencies} />;
    return {
      name: 'DEPENDENCIES',
      render: Tree,
    };
  }, [dependencies]);

  return (
    <div className={classNames(styles.codeTabTree, className)}>
      <DrawerUI
        isOpen={openDrawerList.includes(fileDrawer.name)}
        onToggle={() => handleDrawerToggle(fileDrawer.name)}
        drawer={fileDrawer}
        className={classNames(styles.codeTabDrawer)}
      />
      <DrawerUI
        isOpen={openDrawerList.includes(dependencyDrawer.name)}
        onToggle={() => handleDrawerToggle(dependencyDrawer.name)}
        drawer={dependencyDrawer}
        className={classNames(styles.codeTabDrawer)}
      />
    </div>
  );
}

function getIcon(fileName?: string) {
  if (!fileName) return '';
  const iconName = getIconForFile(fileName);
  const storageLink = 'https://static.bit.dev/file-icons/';
  return `${storageLink}${iconName}`;
}
