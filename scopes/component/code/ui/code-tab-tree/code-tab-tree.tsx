import React, { useState, useCallback, HTMLAttributes } from 'react';
import classNames from 'classnames';
import { FileTree } from '@teambit/tree.file-tree';
import { DrawerUI } from '@teambit/tree.drawer';
import { TreeNode as Node } from '@teambit/tree.tree-node';
import { FolderTreeNode } from '@teambit/tree.folder-tree-node';
import { getFileIcon, FileIconMatch } from '@teambit/code.utils.get-file-icon';
import { Label } from '@teambit/documenter.ui.label';
import type { DependencyType } from '@teambit/ui.queries.get-component-code';
import { DependencyTree } from '../dependency-tree';

import styles from './code-tab-tree.module.scss';

export type CodeTabTreeProps = {
  fileTree: any[];
  dependencies?: DependencyType[];
  currentFile?: string;
  devFiles?: string[];
  mainFile?: string;
  fileIconMatchers?: FileIconMatch[];
} & HTMLAttributes<HTMLDivElement>;

export function CodeTabTree({
  className,
  fileTree,
  dependencies,
  currentFile = '',
  devFiles,
  mainFile,
  fileIconMatchers,
}: CodeTabTreeProps) {
  const [openDrawerList, onToggleDrawer] = useState(['FILES' /* , 'DEPENDENCIES' */]);

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

      const widgets = getWidgets(props.node.id, mainFile, devFiles);
      if (!children) {
        return (
          <Node
            {...props}
            isActive={props.node.id === currentFile}
            icon={getFileIcon(fileIconMatchers, props.node.id)}
            widgets={widgets}
          />
        );
      }
      return <FolderTreeNode {...props} />;
    },
    [currentFile]
  );

  return (
    <div className={classNames(styles.codeTabTree, className)}>
      <DrawerUI
        isOpen={openDrawerList.includes('FILES')}
        onToggle={() => handleDrawerToggle('FILES')}
        name="FILES"
        className={classNames(styles.codeTabDrawer)}
      >
        <FileTree TreeNode={TreeNodeRenderer} files={fileTree || ['']} />
      </DrawerUI>
      <DrawerUI
        isOpen={openDrawerList.includes('DEPENDENCIES')}
        onToggle={() => handleDrawerToggle('DEPENDENCIES')}
        className={classNames(styles.codeTabDrawer)}
        name="DEPENDENCIES"
      >
        <DependencyTree dependenciesArray={dependencies} />
      </DrawerUI>
    </div>
  );
}

function getWidgets(fileName: string, mainFile?: string, devFiles?: string[]) {
  if (fileName === mainFile) {
    return [() => createLabel('main')];
  }
  if (devFiles?.includes(fileName)) {
    return [() => createLabel('dev')];
  }
  return null;
}

function createLabel(str: string) {
  return <Label className={styles.label}>{str}</Label>;
}
