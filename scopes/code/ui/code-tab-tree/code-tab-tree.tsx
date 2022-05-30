import React, { useState, useCallback, HTMLAttributes, useContext } from 'react';
import classNames from 'classnames';
import { affix } from '@teambit/base-ui.utils.string.affix';
import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { TreeNode as Node } from '@teambit/ui-foundation.ui.tree.tree-node';
import { FolderTreeNode } from '@teambit/ui-foundation.ui.tree.folder-tree-node';
import { getFileIcon, FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import { TreeContext } from '@teambit/base-ui.graph.tree.tree-context';
import { useCodeParams } from '@teambit/code.ui.hooks.use-code-params';
import { Label } from '@teambit/documenter.ui.label';
import type { DependencyType } from '@teambit/code.ui.queries.get-component-code';
import { DependencyTree } from '@teambit/code.ui.dependency-tree';

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
      const urlParams = useCodeParams();
      const children = props.node.children;
      const { selected } = useContext(TreeContext);

      const fileUrl = `${props.node.id}${affix('?version=', urlParams.version)}`;
      // (for reference - absolute url)
      // const href = `${currentLaneUrl}${toPathname(component.id)}/~code/${fileUrl}`

      const widgets = getWidgets(props.node.id, mainFile, devFiles);
      if (!children) {
        return (
          <Node
            href={`./${fileUrl}`}
            {...props}
            isActive={props.node.id === selected}
            icon={getFileIcon(fileIconMatchers, props.node.id)}
            widgets={widgets}
          />
        );
      }
      return <FolderTreeNode {...props} />;
    },
    [fileIconMatchers, devFiles]
  );

  return (
    <div className={classNames(styles.codeTabTree, className)}>
      <DrawerUI
        isOpen={openDrawerList.includes('FILES')}
        onToggle={() => handleDrawerToggle('FILES')}
        name="FILES"
        contentClass={styles.codeDrawerContent}
        className={classNames(styles.codeTabDrawer)}
      >
        <FileTree TreeNode={TreeNodeRenderer} files={fileTree || ['']} selected={currentFile} />
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
