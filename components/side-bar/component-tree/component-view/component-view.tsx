import { ComponentTreeSlot } from '@teambit/component-tree';
import { Icon } from '@teambit/evangelist.elements.icon';
import { NavLink } from '@teambit/react-router';
import { clickable } from 'bit-bin/dist/to-eject/css-components/clickable';
import classNames from 'classnames';
import _ from 'lodash';
import React, { useCallback, useContext } from 'react';

import { ComponentTreeContext } from '../component-tree-context';
import { indentClass } from '../indent';
import { PayloadType } from '../payload-type';
import { TreeNodeProps } from '../recursive-tree';
import { getName } from '../utils/get-name';
import styles from './component-view.module.scss';

export type ComponentViewProps<Payload = any> = {
  treeNodeSlot: ComponentTreeSlot;
} & TreeNodeProps<Payload>;

export function ComponentView(props: ComponentViewProps<PayloadType>) {
  // TODO: @oded refactor here to regular prop use.
  const { node } = props;
  const { payload } = node;
  const envId = _.get(payload, ['environment', 'envId']);
  const icon = _.get(payload, ['environment', 'icon']);
  const isDeprecated = _.get(payload, ['deprecation', 'isDeprecate']);

  const { onSelect } = useContext(ComponentTreeContext);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      onSelect && onSelect(node.id, event);
    },
    [onSelect, node.id]
  );

  return (
    <NavLink
      href={`/${node.id}`}
      className={classNames(indentClass, clickable, styles.component)}
      activeClassName={styles.active}
      onClick={handleClick}
    >
      <div className={styles.left}>
        {icon && <img src={icon} alt={envId} className={styles.envIcon} />}
        <span>{getName(node.id)}</span>
      </div>

      <div className={styles.right}>
        {isDeprecated && <Icon of="note-deprecated" className={styles.componentIcon} />}
        {/* {isInternal && <Icon of="Internal" className={styles.componentIcon} />} */}
        {props.treeNodeSlot.toArray().map(([id, treeNode]) => {
          if (!payload) return null;
          return <treeNode.widget key={id} component={payload} />;
        })}
      </div>
    </NavLink>
  );
}
