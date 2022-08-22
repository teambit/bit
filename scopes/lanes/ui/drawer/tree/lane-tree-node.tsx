import { Link } from '@teambit/base-react.navigation.link';
import classNames from 'classnames';
import React, { useCallback, useContext } from 'react';
import { TreeContext } from '@teambit/base-ui.graph.tree.tree-context';
import { indentClass } from '@teambit/base-ui.graph.tree.indent';
import { TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';
import { PayloadType } from '@teambit/ui-foundation.ui.side-bar';
import { LaneModel, LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { LaneIcon } from '@teambit/lanes.ui.icons.lane-icon';
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
        <LaneIcon />
        <Ellipsis className={styles.laneName}>{lane.id.name}</Ellipsis>
      </div>
    </Link>
  );
}
