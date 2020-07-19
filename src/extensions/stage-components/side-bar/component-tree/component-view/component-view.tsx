import React, { useContext, useCallback } from 'react';
import classNames from 'classnames';
import { NavLink } from 'react-router-dom';
import { TreeNodeProps } from '../recursive-tree';
import { ComponentTreeContext } from '../component-tree-context';
import { indentClass } from '../indent';
import { getName } from '../utils/get-name';
import { clickable } from '../../../../../to-eject/css-components/clickable';
import { hoverable } from '../../../../../to-eject/css-components/hoverable';
import styles from './component-view.module.scss';

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
      {/* <span>M</span> */}
    </NavLink>
  );
}
