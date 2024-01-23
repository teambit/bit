import { Icon } from '@teambit/design.elements.icon';
import classNames from 'classnames';
import React, { ReactNode, useState, useEffect } from 'react';

import { TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';
import { indentClass } from '@teambit/base-ui.graph.tree.indent';
import { CollapsableTreeNode } from '@teambit/base-ui.graph.tree.collapsable-tree-node';
import styles from './folder-tree-node.module.scss';

export type FolderPayload = {
  icon?: string | ReactNode;
  open?: boolean;
};

export type FolderTreeNodeProps = {
  className?: string;
} & TreeNodeProps<FolderPayload>;

function getCustomIcon(icon: string | ReactNode) {
  if (!icon) return null;
  if (typeof icon === 'string') {
    if (icon.startsWith('http')) {
      return <img src={icon} className={styles.img} />;
    }
    // for icomoon icons
    return <Icon className={styles.icon} of={icon} />;
  }
  // for custom elements
  return icon;
}

/**
 * Renders a folder node in the file tree
 */
export function FolderTreeNode({ node, depth, className }: FolderTreeNodeProps) {
  const [open, setOpen] = useState(node.payload?.open ?? true);
  useEffect(() => {
    // allow node model to override open state
    node?.payload?.open !== undefined && setOpen(node?.payload?.open);
  }, [node?.payload?.open]);

  const displayName = node.id.replace(/\/$/, '').split('/').pop();
  const CustomIcon = getCustomIcon(node.payload?.icon);
  const Title = node.id && (
    <div className={classNames(indentClass, styles.folder, className)} onClick={() => setOpen(!open)}>
      <div className={styles.left}>
        <Icon className={classNames(styles.icon, !open && styles.collapsed)} of="fat-arrow-down" />
        {CustomIcon}
        <span className={styles.name}>{displayName}</span>
      </div>
    </div>
  );

  return <CollapsableTreeNode title={Title} isOpen={open} node={node} depth={depth} />;
}
