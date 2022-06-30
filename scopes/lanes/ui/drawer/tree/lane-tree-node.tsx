import { Link } from '@teambit/base-react.navigation.link';
import classNames from 'classnames';
import React, { useCallback, useContext } from 'react';
import { TreeContext } from '@teambit/base-ui.graph.tree.tree-context';
import { indentClass } from '@teambit/base-ui.graph.tree.indent';
import { TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';
import { PayloadType } from '@teambit/ui-foundation.ui.side-bar';
import { LaneModel, LanesModel } from '@teambit/lanes.ui.lanes';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';

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
    <Link
      href={LanesModel.getLaneUrl(lane.id)}
      className={classNames(indentClass, styles.lane)}
      activeClassName={styles.active}
      onClick={handleClick}
    >
      <div className={styles.left}>
        <Icon of="lane"></Icon>
        <Ellipsis className={styles.laneName}>{lane.name}</Ellipsis>
      </div>
    </Link>
  );
}
