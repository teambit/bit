import React, { useState, useCallback, HTMLAttributes } from 'react';
import classNames from 'classnames';
import { FileTree } from '@teambit/tree.file-tree';
import { DrawerUI } from '@teambit/tree.drawer';
import { TreeNode as Node } from '@teambit/tree.tree-node';
import { FolderTreeNode } from '@teambit/tree.folder-tree-node';
// import { Label } from '@teambit/documenter.ui.label';
import { getIcon } from '@teambit/ui.get-icon-from-file-name';
import type { DependencyType } from '@teambit/ui.queries.get-component-code';
import { DependencyTree } from '../dependency-tree';

import styles from './code-tab-tree.module.scss';

export type CodeTabTreeProps = {
  fileTree: any[];
  dependencies?: DependencyType[];
  currentFile?: string;
  devFiles?: string[];
} & HTMLAttributes<HTMLDivElement>;

export function CodeTabTree({ className, fileTree, dependencies, currentFile = '', devFiles }: CodeTabTreeProps) {
  const [openDrawerList, onToggleDrawer] = useState(['FILES', 'DEPENDENCIES']);

  const handleDrawerToggle = (id: string) => {
    const isDrawerOpen = openDrawerList.includes(id);
    if (isDrawerOpen) {
      onToggleDrawer((list) => list.filter((drawer) => drawer !== id));
      return;
    }
    onToggleDrawer((list) => list.concat(id));
  };

  // TODO - handle labels for main file or dev
  const widgets = [];

  const TreeNodeRenderer = useCallback(
    function TreeNode(props: any) {
      const children = props.node.children;
      if (!children) {
        return (
          <Node {...props} isActive={props.node.id === currentFile} icon={getIcon(props.node.id)} widgets={widgets} />
        );
      }
      return <FolderTreeNode {...props} />;
    },
    [currentFile, widgets]
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
