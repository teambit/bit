import { Icon } from '@teambit/design.elements.icon';
import classNames from 'classnames';
import React, { ReactNode, useState, useEffect } from 'react';
import AnimateHeight from 'react-animate-height';

import { TreeLayer, TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';
import { indentClass, indentStyle } from '@teambit/base-ui.graph.tree.indent';
import styles from './folder-tree-node.module.scss';

export type FolderTreeNodeProps = {
} & TreeNodeProps<FolderPayload>;

export type FolderPayload = {
  icon?: string | ReactNode;
  open?: boolean;
}

/**
 * Renders a folder node in the file tree
 */
export function FolderTreeNode({ node, depth }: FolderTreeNodeProps) {
  const [open, setOpen] = useState(node.payload?.open ?? true);
  useEffect(() => {
    // allow node model to override open state
    node?.payload?.open !== undefined && setOpen(node?.payload?.open)
  }, [node?.payload?.open])
  const displayName = node.id.replace(/\/$/, '').split('/').pop();

  const CustomIcon =
    node.payload?.icon &&
    (typeof node.payload.icon === 'string' ? (
      <Icon className={styles.icon} of={node.payload.icon} />
    ) : (
      node.payload.icon
    ));

  return (
    <div>
      {node.id && (
        <div className={classNames(indentClass, styles.folder)} onClick={() => setOpen(!open)}>
          <div className={styles.left}>
            <Icon className={classNames(styles.icon, !open && styles.collapsed)} of="fat-arrow-down" />
            {CustomIcon}
            <span className={styles.name}>{displayName}</span>
          </div>
        </div>
      )}
      <AnimateHeight height={open ? 'auto' : 0}>
        <div style={indentStyle(depth + 1)} className={classNames(styles.childrenTree)}>
          {node.children && <TreeLayer childNodes={node.children} depth={depth + 1} />}
        </div>
      </AnimateHeight>
    </div>
  );
}