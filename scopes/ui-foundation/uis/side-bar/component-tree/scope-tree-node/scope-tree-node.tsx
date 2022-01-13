import { Icon } from '@teambit/evangelist.elements.icon';
import { clickable } from '@teambit/legacy/dist/to-eject/css-components/clickable';
import classNames from 'classnames';
import React, { useState, useEffect } from 'react';
import AnimateHeight from 'react-animate-height';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';

import { indentClass, indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { TreeLayer, TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';
import { useTree } from '@teambit/design.ui.tree';
import { PayloadType } from '../payload-type';
import { getName } from '../utils/get-name';
import styles from './scope-tree-node.module.scss';

export type ScopeTreeNodeProps = {
  isActive?: boolean;
} & TreeNodeProps<PayloadType>;

export function ScopeTreeNode({ node, depth, isActive }: ScopeTreeNodeProps) {
  const { isCollapsed } = useTree();
  // const bla = useLocation()
  // const isActive = node.id.includes(bla.pathname)
  const [collapsed, collapse] = useState(isCollapsed);
  const displayName = getName(node.id.replace(/\/$/, ''));
  console.log('isActive scope', isActive);
  // console.log("scope", node.id, bla.pathname)
  useEffect(() => {
    collapse(isCollapsed);
  }, [isCollapsed]);
  // console.log("useLocation", bla)
  // console.log("node",  node)
  return (
    <div>
      {node.id && (
        <div className={classNames(indentClass, clickable, styles.namespace)} onClick={() => collapse(!collapsed)}>
          <div className={styles.left}>
            <Icon className={classNames(styles.arrow, collapsed && styles.collapsed)} of="fat-arrow-down" />
            <Icon className={styles.arrow} of="collection-full" />
            <span className={styles.name}>{displayName}</span>
          </div>
        </div>
      )}
      <AnimateHeight height={collapsed ? 0 : 'auto'}>
        <div style={indentStyle(depth + 1)} className={classNames(styles.componentTree)}>
          {node.children && <TreeLayer childNodes={node.children} depth={depth + 1} />}
        </div>
      </AnimateHeight>
    </div>
  );
}
