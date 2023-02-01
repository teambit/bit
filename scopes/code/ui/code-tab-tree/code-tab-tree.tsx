import React, { useState, HTMLAttributes, ComponentType, useContext } from 'react';
import classNames from 'classnames';
import { FileTree, useFileTreeContext } from '@teambit/ui-foundation.ui.tree.file-tree';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import type { DependencyType } from '@teambit/code.ui.queries.get-component-code';
import { DependencyTree } from '@teambit/code.ui.dependency-tree';
import { ArtifactsTree } from '@teambit/component.ui.artifacts.artifacts-tree';
import { TreeNode, TreeNodeProps } from '@teambit/design.ui.tree';
import { WidgetProps, TreeNode as Node } from '@teambit/ui-foundation.ui.tree.tree-node';
import { TreeContext } from '@teambit/base-ui.graph.tree.tree-context';
import { FolderTreeNode } from '@teambit/ui-foundation.ui.tree.folder-tree-node';

import styles from './code-tab-tree.module.scss';

export type CodeTabTreeProps = {
  fileTree: any[];
  dependencies?: DependencyType[];
  host: string;
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
  host,
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
          TreeNode={FileTreeNode}
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
        host={host}
        getIcon={getIcon}
        drawerOpen={openDrawerList.includes('ARTIFACTS')}
        onToggleDrawer={() => handleDrawerToggle('ARTIFACTS')}
      />
    </div>
  );
}

function FileTreeNode(props: TreeNodeProps<any>) {
  const { node } = props;
  const { id } = node;
  const fileTreeContext = useFileTreeContext();
  const { selected, onSelect } = useContext(TreeContext);
  const href = fileTreeContext?.getHref?.(node);
  const widgets = fileTreeContext?.widgets;
  const icon = fileTreeContext?.getIcon?.(node);
  const isActive = id === selected;

  if (!node?.children) {
    return (
      <Node
        {...props}
        className={classNames(styles.node)}
        activeClassName={styles.active}
        href={href}
        isActive={isActive}
        icon={icon}
        widgets={widgets}
        onClick={onSelect && ((e) => onSelect(node.id, e))}
      />
    );
  }
  return <FolderTreeNode className={classNames(styles.node)} {...props} />;
}
