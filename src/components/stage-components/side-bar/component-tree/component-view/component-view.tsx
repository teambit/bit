import React, { useContext, useCallback } from 'react';
import _ from 'lodash';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist-temp.elements.icon';
import { TreeNodeProps } from '../recursive-tree';
import { ComponentTreeContext } from '../component-tree-context';
import { indentClass } from '../indent';
import { getName } from '../utils/get-name';
import { clickable } from '../../../../../to-eject/css-components/clickable';
import { hoverable } from '../../../../../to-eject/css-components/hoverable';
import { PayloadType } from '../payload-type';
import { NavLink } from '../../../../../extensions/react-router/nav-link';
// import { ComponentStatusResolver } from '../component-status-resolver';
// import { StatusTooltip } from '../component-tooltip';
import styles from './component-view.module.scss';
import { ComponentTreeSlot } from '../../../../../extensions/component-tree/component-tree.ui';

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
      className={classNames(indentClass, clickable, hoverable, styles.component)}
      activeClassName={styles.active}
      onClick={handleClick}
    >
      <div className={styles.left}>
        {icon && <img src={icon} alt={envId} className={styles.envIcon} />}
        <span>{getName(node.id)}</span>
      </div>

      <div className={styles.right} data-tip="" data-for={node.id}>
        {isDeprecated && <Icon of="note-deprecated" className={styles.componentIcon} />}
        {/* {isInternal && <Icon of="Internal" className={styles.componentIcon} />} */}
        {/* <ComponentStatusResolver status={status} />
        <StatusTooltip status={status} name={componentName} /> */}
        {props.treeNodeSlot.toArray().map(([id, treeNode]) => {
          if (!payload) return null;
          return <treeNode.widget key={id} component={payload} />;
        })}
      </div>
    </NavLink>
  );
}
