import { Icon } from '@teambit/evangelist.elements.icon';
import { clickable } from '@teambit/legacy/dist/to-eject/css-components/clickable';
import classNames from 'classnames';
import React, { useState } from 'react';
import AnimateHeight from 'react-animate-height';

import { TreeLayer, TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';
import { indentClass, indentStyle } from '@teambit/base-ui.graph.tree.indent';
import styles from './folder-tree-node.module.scss';

/**
 * Renders a folder node in the file tree
 */
export function FolderTreeNode<T>({ node, depth }: TreeNodeProps<T>) {
  const [collapsed, collapse] = useState(false);
  const displayName = node.id.replace(/\/$/, '').split('/').pop();

  return (
    <div>
      {node.id && (
        <div className={classNames(indentClass, clickable, styles.folder)} onClick={() => collapse(!collapsed)}>
          <div className={styles.left}>
            <Icon className={classNames(styles.arrow, collapsed && styles.collapsed)} of="fat-arrow-down" />
            <span className={styles.name}>{displayName}</span>
          </div>
        </div>
      )}
      <AnimateHeight height={collapsed ? 0 : 'auto'}>
        <div style={indentStyle(depth + 1)} className={classNames(styles.childrenTree)}>
          {node.children && <TreeLayer childNodes={node.children} depth={depth + 1} />}
        </div>
      </AnimateHeight>
    </div>
  );
}
