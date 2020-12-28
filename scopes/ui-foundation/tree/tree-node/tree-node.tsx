// import { ComponentTreeSlot } from '@teambit/component-tree';
import { NavLink } from '@teambit/ui.react-router.nav-link';
// import { EnvIcon } from '@teambit/ui.env-icon';
// import { DeprecationIcon } from '@teambit/ui.deprecation-icon';
import { clickable } from 'bit-bin/dist/to-eject/css-components/clickable';
import classNames from 'classnames';
// import React, { useCallback, useContext } from 'react';
import React from 'react';
// import { Icon } from '@teambit/evangelist.elements.icon';
// import ReactTooltip from 'react-tooltip';
// import { ComponentModel } from '@teambit/component';
import { indentClass } from '@teambit/tree.indent';
import { TreeNodeProps } from '@teambit/tree.recursive-tree';
// import { ComponentTreeContext } from '../component-tree-context';
// import { PayloadType } from '../payload-type';
// import { getName } from '../utils/get-name';
import styles from './tree-node.module.scss';

export type TreeNodeComponentProps<Payload = any> = {
  treeNodeSlot?: any; // TODO - decide how we want to pass the right icons and if we can merge this with ComponentView
  isActive?: boolean;
  icon?: string;
} & TreeNodeProps<Payload>;

export function TreeNode<T>(props: TreeNodeComponentProps<T>) {
  const { node, isActive = false, icon } = props;
  const component = node.payload;

  // const { onSelect } = useContext(ComponentTreeContext);

  // const handleClick = useCallback(
  //   (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
  //     onSelect && onSelect(node.id, event);
  //   },
  //   [onSelect, node.id]
  // );

  // if (!(component instanceof ComponentModel)) return null;
  // console.log('component node', props.node.id, isActive)
  // const icon = '';
  return (
    <NavLink
      href={`#${props.node.id}`}
      isActive={() => isActive}
      exact
      strict
      className={classNames(indentClass, clickable, styles.fileNode)}
      activeClassName={styles.active}
      // onClick={handleClick}
    >
      <div className={styles.left}>
        <img className={styles.icon} src={icon} />
        <span>{node.id.split('/').pop()}</span>
      </div>

      <div className={styles.right}>
        {props.treeNodeSlot &&
          props.treeNodeSlot.toArray().map(([id, treeNode]) => <treeNode.widget key={id} component={component} />)}
      </div>
    </NavLink>
  );
}
