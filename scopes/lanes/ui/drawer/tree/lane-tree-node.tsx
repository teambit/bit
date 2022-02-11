import { NavLink } from '@teambit/base-ui.routing.nav-link';
import { clickable } from '@teambit/legacy/dist/to-eject/css-components/clickable';
import classNames from 'classnames';
import React, { useCallback, useContext } from 'react';
import { TreeContext } from '@teambit/base-ui.graph.tree.tree-context';
import { indentClass } from '@teambit/base-ui.graph.tree.indent';
import { TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';
import { PayloadType } from '@teambit/ui-foundation.ui.side-bar';
import { LaneModel } from '@teambit/lanes.ui.lanes';
import styles from './lane-tree-node.module.scss';

export type LaneTreeNodeProps<Payload = PayloadType> = {} & TreeNodeProps<Payload>;

export function LaneTreeNode(props: LaneTreeNodeProps) {
  const { node } = props;
  const lane = node.payload as LaneModel;

  const { onSelect } = useContext(TreeContext);
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      onSelect && onSelect(node.id, event);
    },
    [onSelect, node.id]
  );

  return (
    <NavLink
      href={lane.url}
      className={classNames(indentClass, clickable, styles.lane)}
      activeClassName={styles.active}
      onClick={handleClick}
    >
      <div className={styles.left}>
        <img src={'https://static.bit.dev/bit-icons/lane.svg'} alt={lane?.id} />
        <span>{lane?.name}</span>
      </div>
    </NavLink>
  );
}
