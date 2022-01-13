import { Icon } from '@teambit/evangelist.elements.icon';
import { clickable } from '@teambit/legacy/dist/to-eject/css-components/clickable';
import classNames from 'classnames';
import React, { useState, useEffect } from 'react';
import AnimateHeight from 'react-animate-height';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';

import { indentClass, indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { TreeNodeProps, TreeLayer } from '@teambit/base-ui.graph.tree.recursive-tree';
import { useTree } from '@teambit/design.ui.tree';
import { PayloadType } from '../payload-type';
import { getName } from '../utils/get-name';
import styles from './namespace-tree-node.module.scss';

export type NamespaceTreeNodeProps = {
  isActive?: boolean;
} & TreeNodeProps<PayloadType>;

export function NamespaceTreeNode({ node, depth, isActive }: NamespaceTreeNodeProps) {
  const { isCollapsed } = useTree();

  const [collapsed, collapse] = useState(isCollapsed && !isActive);
  // const bla = useLocation()
  // const isActive = node.id.includes(bla.pathname)
  console.log('isActive namespace', isActive);
  useEffect(() => {
    if (isActive) return collapse(false);
    collapse(isCollapsed);
  }, [isCollapsed]);

  const displayName = getName(node.id.replace(/\/$/, ''));
  const highlighted = collapsed && isActive;
  return (
    <div>
      {node.id && (
        <div
          className={classNames(indentClass, clickable, styles.namespace, highlighted && styles.highlighted)}
          onClick={() => collapse(!collapsed)}
        >
          <div className={styles.left}>
            <Icon className={classNames(styles.arrow, collapsed && styles.collapsed)} of="fat-arrow-down" />
            <span className={styles.name}>{displayName}</span>
          </div>
        </div>
      )}
      <AnimateHeight height={collapsed ? 0 : 'auto'}>
        <div style={indentStyle(depth + 1)} className={classNames(styles.componentTree)}>
          {node.children && <TreeLayer childNodes={node.children} depth={depth} />}
        </div>
      </AnimateHeight>
    </div>
  );
}
