import { Icon } from '@teambit/evangelist.elements.icon';
import { clickable } from '@teambit/legacy/dist/to-eject/css-components/clickable';
import classNames from 'classnames';
import React, { useState } from 'react';
import AnimateHeight from 'react-animate-height';

import { indentClass, indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { TreeNodeProps, TreeLayer } from '@teambit/base-ui.graph.tree.recursive-tree';
import { PayloadType } from '../payload-type';
import { getName } from '../utils/get-name';
import styles from './namespace-tree-node.module.scss';

export function NamespaceTreeNode({ node, depth }: TreeNodeProps<PayloadType>) {
  const [collapsed, collapse] = useState(false);

  const displayName = getName(node.id.replace(/\/$/, ''));

  return (
    <div>
      {node.id && (
        <div className={classNames(indentClass, clickable, styles.namespace)} onClick={() => collapse(!collapsed)}>
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
