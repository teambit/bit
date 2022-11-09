import React, { useState, HTMLAttributes, ComponentType } from 'react';
import classNames from 'classnames';
import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import type { DependencyType } from '@teambit/code.ui.queries.get-component-code';
import { DependencyTree } from '@teambit/code.ui.dependency-tree';
import { TreeNode } from '@teambit/design.ui.tree';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { ArtifactsTree } from '@teambit/component.ui.artifacts.artifacts-tree';
import { Artifact, ArtifactFile } from '@teambit/component.ui.artifacts.models.component-artifacts-model';

import styles from './code-tab-tree.module.scss';

export type CodeTabTreeProps = {
  fileTree: any[];
  dependencies?: DependencyType[];
  artifactsTree: string[];
  artifacts: Array<Artifact>;
  artifactFiles: Array<ArtifactFile & { id: string }>;
  loadingArtifacts?: boolean;
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
  artifactFiles,
  artifactsTree,
  artifacts,
  loadingArtifacts,
  widgets,
  getHref,
  getIcon,
}: CodeTabTreeProps) {
  const defaultDrawer = () => {
    if (currentFile.startsWith('~artifact')) return ['ARTIFACTS'];
    return ['FILES'];
  };
  const [openDrawerList, onToggleDrawer] = useState(defaultDrawer);

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
        className={classNames(styles.codeTabDrawer, openDrawerList.includes('FILES') && styles.openDrawer)}
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
        className={classNames(styles.codeTabDrawer, openDrawerList.includes('DEPENDENCIES') && styles.openDrawer)}
        contentClass={styles.codeDrawerContent}
        name="DEPENDENCIES"
      >
        <DependencyTree dependenciesArray={dependencies} />
      </DrawerUI>
      <ArtifactsTree
        drawerName="ARTIFACTS"
        artifacts={artifacts}
        artifactFiles={artifactFiles}
        fileTree={artifactsTree}
        loading={loadingArtifacts}
        getIcon={getIcon}
        drawerOpen={openDrawerList.includes('ARTIFACTS')}
        onToggleDrawer={() => handleDrawerToggle('ARTIFACTS')}
      />
    </div>
  );
}
