import React, { HTMLAttributes, useState, useMemo, ComponentType } from 'react';
import classNames from 'classnames';
import { FileIconSlot } from '@teambit/code';
import { flatten } from 'lodash';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
import { FileIconMatch, getFileIcon } from '@teambit/code.ui.utils.get-file-icon';
import { TreeNode } from '@teambit/design.ui.tree';
import { DependencyType } from '@teambit/code.ui.queries.get-component-code';
import { CompareDependencyTree } from '@teambit/code.ui.code-compare';

import styles from './code-compare-tree.module.scss';

export type CodeCompareTreeProps = {
  currentFile?: string;
  fileIconSlot?: FileIconSlot;
  fileTree: string[];
  drawerName: string;
  widgets?: ComponentType<WidgetProps<any>>[];
  getHref?: (node: TreeNode) => string;
  onTreeNodeSelected?: (id: string, event?: React.MouseEvent) => void;
  baseDependencies?: DependencyType[];
  compareDependencies?: DependencyType[];
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
  baseDependencies,
  compareDependencies,
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

  const hasDependencies = (baseDependencies || []).concat(compareDependencies || []).length > 0;

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
      {hasDependencies && (
        <DrawerUI
          isOpen={openDrawerList.includes('DEPENDENCIES')}
          onToggle={() => handleDrawerToggle('DEPENDENCIES')}
          className={classNames(styles.codeTabDrawer, openDrawerList.includes('DEPENDENCIES') && styles.openDrawer)}
          contentClass={styles.codeDrawerContent}
          name="DEPENDENCIES"
        >
          <CompareDependencyTree
            baseDependenciesArray={baseDependencies}
            compareDependenciesArray={compareDependencies}
          />
        </DrawerUI>
      )}
    </div>
  );
}

function getIcon(fileIconMatchers: FileIconMatch[]) {
  return function Icon({ id }: TreeNode) {
    return getFileIcon(fileIconMatchers, id);
  };
}
