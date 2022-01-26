import { NavLink } from '@teambit/base-ui.routing.nav-link';
import { clickable } from '@teambit/legacy/dist/to-eject/css-components/clickable';
import classNames from 'classnames';
import React, { useCallback, useContext } from 'react';
import { TreeContext } from '@teambit/base-ui.graph.tree.tree-context';
import { indentClass } from '@teambit/base-ui.graph.tree.indent';
import { TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';
import { PayloadType } from '@teambit/ui-foundation.ui.side-bar';
import { LaneViewModel } from '@teambit/lanes.lanes.ui';
import { Icon } from '@teambit/design.elements.icon';
import styles from './lane-view.module.scss';

export type LaneViewProps<Payload = PayloadType> = {} & TreeNodeProps<Payload>;

export function LaneView(props: LaneViewProps) {
  const { node } = props;
  const lane = node.payload as LaneViewModel;

  const { onSelect } = useContext(TreeContext);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      onSelect && onSelect(node.id, event);
    },
    [onSelect, node.id]
  );

  return (
    <NavLink
      href={`/~lane/${lane?.name}`}
      className={classNames(indentClass, clickable, styles.lane)}
      activeClassName={styles.active}
      onClick={handleClick}
    >
      <div className={styles.left}>
        <Icon of="right-arrow" />
        <span>{lane?.laneName}</span>
      </div>
    </NavLink>
  );
}
