import React, { useState, useContext, useCallback } from 'react';
import classNames from 'classnames';
import { NavLink } from 'react-router-dom';
import { Icon } from '@bit/bit.evangelist.elements.icon';

import { TreeNodeProps, TreeLayer } from '../recursive-tree';
import { ComponentTreeContext } from '../component-tree-context';
import { indentStyle, indentClass } from '../indent';
import { getName } from '../utils/get-name';
import { clickable } from '../../../../../../to-eject/css-components/clickable';
import { hoverable } from '../../../../../../to-eject/css-components/hoverable';

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

      {!collapsed && (
        <div style={indentStyle(depth + 1)}>
          {node.children && <TreeLayer childNodes={node.children} depth={depth} />}
        </div>
      )}
    </div>
  );
}

export function ComponentView(props: TreeNodeProps) {
  const { node } = props;
  const { onSelect } = useContext(ComponentTreeContext);
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      onSelect && onSelect(node.id, event);
    },
    [onSelect, node.id]
  );

  return (
    <NavLink
      to={`/${node.id}`}
      className={classNames(indentClass, clickable, hoverable, styles.component)}
      activeClassName={styles.active}
      onClick={handleClick}
    >
      {getName(node.id)}
    </NavLink>
  );
}
