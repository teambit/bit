import React, { useState, HTMLAttributes, ComponentType } from 'react';
import classNames from 'classnames';
import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import type { DependencyType } from '@teambit/code.ui.queries.get-component-code';
import { DependencyTree } from '@teambit/code.ui.dependency-tree';
import { TreeNode } from '@teambit/design.ui.tree';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { ComponentID } from '@teambit/component-id';
import { ArtifactsTree } from '@teambit/component.ui.artifacts.artifacts-tree';

import styles from './code-tab-tree.module.scss';

export type CodeTabTreeProps = {
  fileTree: any[];
  host: string;
  componentId: ComponentID;
  dependencies?: DependencyType[];
  currentFile?: string;
  widgets?: ComponentType<WidgetProps<any>>[];
  getHref?: (node: TreeNode) => string;
  getIcon?: (node: TreeNode) => string | undefined;
} & HTMLAttributes<HTMLDivElement>;

export function CodeTabTree({
  className,
  fileTree,
  dependencies,
  currentFile = '',
  widgets,
  getHref,
  getIcon,
  host,
  componentId,
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
        <FileTree
          files={fileTree || ['']}
          widgets={widgets}
          getHref={getHref}
          getIcon={getIcon}
          selected={currentFile}
        />
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
      <ArtifactsTree
        drawerName="ARTIFACTS"
        host={host}
        componentId={componentId}
        getIcon={getIcon}
        drawerOpen={openDrawerList.includes('ARTIFACTS')}
        onToggleDrawer={() => handleDrawerToggle('ARTIFACTS')}
      />
    </div>
  );
}
