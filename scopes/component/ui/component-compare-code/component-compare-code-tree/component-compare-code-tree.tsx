import React, { HTMLAttributes, useContext, useMemo, useCallback, useState } from 'react';
import classNames from 'classnames';
import { FileIconSlot } from '@teambit/code';
import { TreeNode as Node } from '@teambit/ui-foundation.ui.tree.tree-node';
import { FolderTreeNode } from '@teambit/ui-foundation.ui.tree.folder-tree-node';
import { FileIconMatch, getFileIcon } from '@teambit/code.ui.utils.get-file-icon';
import flatten from 'lodash.flatten';
import { TreeContext } from '@teambit/base-ui.graph.tree.tree-context';
import { useComponentCompareParams, getComponentCompareUrl } from '@teambit/component.ui.component-compare';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
import styles from './component-compare-code-tree.module.scss';

export type ComponentCompareCodeTreeProps = {
  currentFile?: string;
  fileIconSlot?: FileIconSlot;
  fileTree: string[];
} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareCodeTree({
  currentFile,
  fileIconSlot,
  className,
  fileTree,
}: ComponentCompareCodeTreeProps) {
  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);

  const treeNodeRenderer = useCallback(
    function TreeNode(props: any) {
      const children = props.node.children;
      const { selected } = useContext(TreeContext);
      const compareQueryParams = useComponentCompareParams();

      const href = getComponentCompareUrl({ ...compareQueryParams, selectedFile: props.node.id });
      const icon = getFileIcon(fileIconMatchers, props.node.id);

      if (!children) {
        return <Node href={href} {...props} isActive={props.node.id === selected} icon={icon} />;
      }
      return <FolderTreeNode {...props} />;
    },
    [fileIconMatchers]
  );

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
    <div className={classNames(styles.componentCompareCodeTreeContainer, className)}>
      <DrawerUI
        isOpen={openDrawerList.includes('FILES')}
        onToggle={() => handleDrawerToggle('FILES')}
        name="FILES"
        contentClass={styles.componentCompareCodeDrawerContent}
        className={classNames(styles.componentCompareCodeTabDrawer)}
      >
        <FileTree TreeNode={treeNodeRenderer} files={fileTree || ['']} selected={currentFile} />
      </DrawerUI>
    </div>
  );
}

// function getWidgets(fileName: string, mainFile?: string, devFiles?: string[]) {
//   if (fileName === mainFile) {
//     return [() => createLabel('main')];
//   }
//   if (devFiles?.includes(fileName)) {
//     return [() => createLabel('dev')];
//   }
//   return null;
// }

// function createLabel(str: string) {
//   return <Label className={styles.label}>{str}</Label>;
// }
