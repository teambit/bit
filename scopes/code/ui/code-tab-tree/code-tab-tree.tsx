import React, { useState, HTMLAttributes } from 'react';
import classNames from 'classnames';
import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';

import type { DependencyType } from '@teambit/code.ui.queries.get-component-code';
import { DependencyTree } from '@teambit/code.ui.dependency-tree';
import { TreeNodeRenderer } from '@teambit/base-ui.graph.tree.recursive-tree';

import styles from './code-tab-tree.module.scss';

export type CodeTabTreeProps = {
  fileTree: any[];
  dependencies?: DependencyType[];
  currentFile?: string;
  treeNodeRenderer: TreeNodeRenderer<any>;
} & HTMLAttributes<HTMLDivElement>;

export function CodeTabTree({
  className,
  fileTree,
  dependencies,
  currentFile = '',
  treeNodeRenderer,
}: CodeTabTreeProps) {
  const [openDrawerList, onToggleDrawer] = useState(['FILES']);

  const handleDrawerToggle = (id: string) => {
    const isDrawerOpen = openDrawerList.includes(id);
    if (isDrawerOpen) {
      onToggleDrawer((list) => list.filter((drawer) => drawer !== id));
      return;
    }
    onToggleDrawer((list) => list.concat(id));
  };

  return (
    <div className={classNames(styles.codeTabTree, className)}>
      <DrawerUI
        isOpen={openDrawerList.includes('FILES')}
        onToggle={() => handleDrawerToggle('FILES')}
        name="FILES"
        contentClass={styles.codeDrawerContent}
        className={classNames(styles.codeTabDrawer)}
      >
        <FileTree TreeNode={treeNodeRenderer} files={fileTree || ['']} selected={currentFile} />
      </DrawerUI>
      <DrawerUI
        isOpen={openDrawerList.includes('DEPENDENCIES')}
        onToggle={() => handleDrawerToggle('DEPENDENCIES')}
        className={classNames(styles.codeTabDrawer)}
        contentClass={styles.codeDrawerContent}
        name="DEPENDENCIES"
      >
        <DependencyTree dependenciesArray={dependencies} />
      </DrawerUI>
    </div>
  );
}
