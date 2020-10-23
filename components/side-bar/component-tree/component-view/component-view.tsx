import { ComponentTreeSlot } from '@teambit/component-tree';
import { NavLink } from '@teambit/react-router';
import { EnvIcon } from '@teambit/staged-components.env-icon';
import { DeprecationIcon } from '@teambit/staged-components.deprecation-icon';
import { clickable } from 'bit-bin/dist/to-eject/css-components/clickable';
import classNames from 'classnames';
import React, { useCallback, useContext } from 'react';

import { ComponentModel } from '@teambit/component';
import { ComponentTreeContext } from '../component-tree-context';
import { indentClass } from '../indent';
import { PayloadType } from '../payload-type';
import { TreeNodeProps } from '../recursive-tree';
import { getName } from '../utils/get-name';
import styles from './component-view.module.scss';

export type ComponentViewProps<Payload = any> = {
  treeNodeSlot?: ComponentTreeSlot;
} & TreeNodeProps<Payload>;

export function ComponentView(props: ComponentViewProps<PayloadType>) {
  const { node } = props;
  const component = node.payload;

  const { onSelect } = useContext(ComponentTreeContext);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      onSelect && onSelect(node.id, event);
    },
    [onSelect, node.id]
  );

  if (!(component instanceof ComponentModel)) return null;

  return (
    <NavLink
      href={`/${component.id.fullName}`}
      className={classNames(indentClass, clickable, styles.component)}
      activeClassName={styles.active}
      onClick={handleClick}
    >
      <div className={styles.left}>
        <EnvIcon component={component} className={styles.envIcon} />
        <span>{getName(node.id)}</span>
      </div>

      <div className={styles.right}>
        <DeprecationIcon component={component} />
        {/* {isInternal && <Icon of="Internal" className={styles.componentIcon} />} */}
        {props.treeNodeSlot &&
          props.treeNodeSlot.toArray().map(([id, treeNode]) => <treeNode.widget key={id} component={component} />)}
      </div>
    </NavLink>
  );
}
