import React, { useState } from 'react';
import classNames from 'classnames';
import { Icon } from '@bit/bit.evangelist.elements.icon';
import { TreeNodeProps, TreeLayer } from '../recursive-tree';
import { indentStyle, indentClass } from '../indent';
import { getName } from '../utils/get-name';
import { clickable } from '../../../../../to-eject/css-components/clickable';
import styles from './component-nodes.module.scss';

export function ScopeView({ node, depth }: TreeNodeProps) {
  return (
    <>
      <div className={classNames(indentClass, styles.scope)}>{node.id}</div>

      <div style={indentStyle(depth + 1)}>
        {node.children && <TreeLayer childNodes={node.children} depth={depth} />}
      </div>
    </>
  );
}
export function NamespaceView({ node, depth }: TreeNodeProps) {
  const [collapsed, collapse] = useState(false);

  return (
    <div data-collapsed={collapsed}>
      {node.id && (
        <div className={classNames(indentClass, clickable, styles.namespace)} onClick={() => collapse(!collapsed)}>
          <Icon className={styles.arrow} of="fat-arrow-down" />
          {getName(node.id)}
        </div>
      )}

      <div style={indentStyle(depth + 1)} className={classNames(styles.componentTree, { [styles.open]: !collapsed })}>
        {node.children && <TreeLayer childNodes={node.children} depth={depth} />}
      </div>
    </div>
  );
}
