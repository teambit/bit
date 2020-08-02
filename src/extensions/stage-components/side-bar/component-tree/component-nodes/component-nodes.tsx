import React, { useState } from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist-temp.elements.icon';
import { TreeNodeProps, TreeLayer } from '../recursive-tree';
import { indentStyle, indentClass } from '../indent';
import { getName } from '../utils/get-name';
import { clickable } from '../../../../../to-eject/css-components/clickable';
import { hoverable } from '../../../../../to-eject/css-components/hoverable';
import { StatusDot } from '../status-dot/status-dot';
import styles from './component-nodes.module.scss';
import { PayloadType } from '../payload-type';

export function ScopeView({ node, depth }: TreeNodeProps<PayloadType>) {
  return (
    <>
      <div className={classNames(indentClass, styles.scope)}>{node.id}</div>

      <div style={indentStyle(depth + 1)}>
        {node.children && <TreeLayer childNodes={node.children} depth={depth} />}
      </div>
    </>
  );
}
export function NamespaceView({ node, depth, status }: TreeNodeProps<PayloadType>) {
  const [collapsed, collapse] = useState(false);

  return (
    <div data-collapsed={collapsed}>
      {node.id && (
        <div
          className={classNames(indentClass, hoverable, clickable, styles.namespace)}
          onClick={() => collapse(!collapsed)}
        >
          <div>
            <Icon className={styles.arrow} of="fat-arrow-down" />
            <span>{getName(node.id)}</span>
          </div>
          <div>{status && <StatusDot status="new" />}</div>
        </div>
      )}

      <div style={indentStyle(depth + 1)} className={classNames(styles.componentTree, { [styles.open]: !collapsed })}>
        {node.children && <TreeLayer childNodes={node.children} depth={depth} />}
      </div>
    </div>
  );
}
