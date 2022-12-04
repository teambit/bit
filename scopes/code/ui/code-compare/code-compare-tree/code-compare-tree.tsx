import React, { HTMLAttributes, useState, useMemo, ComponentType } from 'react';
import classNames from 'classnames';
import { FileIconSlot } from '@teambit/code';
import { flatten } from 'lodash';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
import { FileIconMatch, getFileIcon } from '@teambit/code.ui.utils.get-file-icon';
import { TreeNode } from '@teambit/design.ui.tree';

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
      >
        <FileTree
          getHref={getHref}
          files={fileTree || ['']}
          selected={currentFile}
          widgets={widgets}
          getIcon={getIcon(fileIconMatchers)}
          onTreeNodeSelected={onTreeNodeSelected}
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
