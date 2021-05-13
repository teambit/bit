import { NavLink } from '@teambit/base-ui.routing.nav-link';
import { clickable } from '@teambit/legacy/dist/to-eject/css-components/clickable';
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
  href?: string;
} & TreeNodeProps<Payload>;

/**
 *
 * Renders a file node in the file tree
 */
export function TreeNode<T>(props: TreeNodeComponentProps<T>) {
  const { node, isActive = false, icon, onClick, widgets, href } = props;
  return (
    <NavLink
      href={href || node.id}
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
