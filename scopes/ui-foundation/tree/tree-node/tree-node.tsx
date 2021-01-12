import { NavLink } from '@teambit/ui.react-router.nav-link';
import { clickable } from 'bit-bin/dist/to-eject/css-components/clickable';
import classNames from 'classnames';
import React, { ComponentType } from 'react';
import { indentClass } from '@teambit/base-ui.graph.tree.indent';
import { TreeNodeProps, TreeNode as TreeNodeType } from '@teambit/base-ui.graph.tree.recursive-tree';
import styles from './tree-node.module.scss';

export type WidgetProps<Payload> = {
  node: TreeNodeType<Payload>;
};

export type TreeNodeComponentProps<Payload = any> = {
  widgets?: ComponentType<WidgetProps<Payload>>[];
  isActive?: boolean;
  icon?: string;
  onClick?: (e: React.MouseEvent) => void;
} & TreeNodeProps<Payload>;

export function TreeNode<T>(props: TreeNodeComponentProps<T>) {
  const { node, isActive = false, icon, onClick, widgets } = props;
  return (
    <NavLink
      href={`#${props.node.id}`}
      isActive={() => isActive}
      exact
      strict
      className={classNames(indentClass, clickable, styles.fileNode)}
      activeClassName={styles.active}
      onClick={onClick}
    >
      <div className={styles.left}>
        <img className={styles.icon} src={icon} />
        <span>{node.id.split('/').pop()}</span>
      </div>

      <div className={styles.right}>
        {widgets?.map((Widget, index) => (
          <Widget key={index} node={node} />
        ))}
      </div>
    </NavLink>
  );
}
