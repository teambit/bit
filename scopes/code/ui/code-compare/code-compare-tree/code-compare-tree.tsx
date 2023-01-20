import React, { HTMLAttributes, useState, useMemo, ComponentType, useContext } from 'react';
import classNames from 'classnames';
import { FileIconSlot } from '@teambit/code';
import flatten from 'lodash.flatten';
import { WidgetProps, TreeNode as Node } from '@teambit/ui-foundation.ui.tree.tree-node';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { FileTree, useFileTreeContext } from '@teambit/ui-foundation.ui.tree.file-tree';
import { FolderTreeNode } from '@teambit/ui-foundation.ui.tree.folder-tree-node';
import { FileIconMatch, getFileIcon } from '@teambit/code.ui.utils.get-file-icon';
import { TreeNode, TreeNodeProps } from '@teambit/design.ui.tree';
import { TreeContext } from '@teambit/base-ui.graph.tree.tree-context';
import styles from './code-compare-tree.module.scss';

export type CodeCompareTreeProps = {
  currentFile?: string;
  fileIconSlot?: FileIconSlot;
  fileTree: string[];
  drawerName: string;
  widgets?: ComponentType<WidgetProps<any>>[];
  getHref?: (node: TreeNode) => string;
  onTreeNodeSelected?: (id: string, event?: React.MouseEvent) => void;
} & HTMLAttributes<HTMLDivElement>;

export function CodeCompareTree({
  currentFile,
  fileIconSlot,
  className,
  fileTree,
  drawerName,
  widgets,
  getHref,
  onTreeNodeSelected,
}: CodeCompareTreeProps) {
  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);

  const defaultDrawer = () => {
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
    <div className={classNames(styles.componentCompareCodeTreeContainer, className)}>
      <DrawerUI
        isOpen={openDrawerList.includes('FILES')}
        onToggle={() => handleDrawerToggle('FILES')}
        name={drawerName}
        contentClass={styles.componentCompareCodeDrawerContent}
        className={classNames(styles.componentCompareCodeTabDrawer)}
        drawerNameClass={styles.componentCompareDrawerName}
      >
        <FileTree
          getHref={getHref}
          files={fileTree}
          selected={currentFile}
          widgets={widgets}
          getIcon={getIcon(fileIconMatchers)}
          onTreeNodeSelected={onTreeNodeSelected}
          TreeNode={CompareFileTreeNode}
        />
      </DrawerUI>
    </div>
  );
}

function getIcon(fileIconMatchers: FileIconMatch[]) {
  return function Icon({ id }: TreeNode) {
    return getFileIcon(fileIconMatchers, id);
  };
}

function CompareFileTreeNode(props: TreeNodeProps<any>) {
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
