import React, { useContext, useCallback } from 'react';
import _ from 'lodash';
import classNames from 'classnames';
// import { Image } from '@bit/bit.evangelist.elements.image';
import { Icon } from '@bit/bit.evangelist.elements.icon';
import { NavLink } from '../../../../react-router/nav-link';
import { TreeNodeProps } from '../recursive-tree';
import { ComponentTreeContext } from '../component-tree-context';
import { indentClass } from '../indent';
import { getName } from '../utils/get-name';
import { clickable } from '../../../../../to-eject/css-components/clickable';
import { hoverable } from '../../../../../to-eject/css-components/hoverable';
import styles from './component-view.module.scss';
import { ComponentStatus } from '../component-status/component-status';
import { PayloadType } from '../payload-type';

export type ComponentViewProps<Payload = any> = {
  // env?: 'react' | 'angular' | 'vue' | 'stencil';
} & TreeNodeProps<Payload>;

export function ComponentView(props: ComponentViewProps<PayloadType>) {
  const { node } = props;
  const { payload } = node;
  const envId = _.get(payload, ['env', 'envId']);
  const icon = _.get(payload, ['env', 'icon']);
  const isNew = _.get(payload, ['status', 'isNew']);
  const isDeprecated = _.get(payload, ['deprection', 'isDeprecate']);

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
      className={classNames(indentClass, clickable, hoverable, styles.component)}
      activeClassName={styles.active}
      onClick={handleClick}
    >
      <div className={styles.left}>
        {icon && <img src={icon} alt={envId} />}
        <span>{getName(node.id)}</span>
      </div>

      <div className={styles.right}>
        {isDeprecated && <Icon of="note-deprecated" className={styles.componentIcon} />}
        {/* {isInternal && <Icon of="Internal" className={styles.componentIcon} />} */}
        {isNew && <ComponentStatus status="new" />}
      </div>
    </NavLink>
  );
}
