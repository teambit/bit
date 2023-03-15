import React, { HTMLAttributes } from 'react';
import classnames from 'classnames';
import { LaneId } from '@teambit/lane-id';
import { LaneModel, LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { ScopeIcon } from '@teambit/scope.ui.scope-icon';
import { TimeAgo } from '@teambit/design.ui.time-ago';

import styles from './lane-menu-item.module.scss';

export type LaneMenuItemProps = {
  selected?: LaneId;
  current: LaneModel;
  getHref?: (laneId: LaneId) => string;
  onLaneSelected?: (laneId: LaneId) => void;
} & HTMLAttributes<HTMLDivElement>;

export function LaneMenuItem({
  selected,
  current,
  className,
  onLaneSelected,
  getHref = LanesModel.getLaneUrl,
  ...rest
}: LaneMenuItemProps) {
  const isCurrent = selected?.toString() === current.id.toString();
  const isDefaultLane = current.id.isDefault();

  const href = getHref(current.id);

  const onClick = () => {
    onLaneSelected?.(current.id);
  };

  const laneDescription = current.description || current.id.name;
  const laneName = current.id.name;
  const timestamp = current.updatedAt || current.createdAt;

  return (
    <div {...rest} className={classnames(className, styles.laneMenuItemContainer)}>
      <MenuLinkItem active={isCurrent} href={href} className={styles.menuItem} onClick={onClick}>
        <div className={styles.laneContainer}>
          <div className={styles.left}>
            <div className={styles.icon}>{isDefaultLane ? <ScopeIcon size={14} /> : <ScopeIcon size={14} />}</div>
            <div className={styles.laneInfo}>
              <div className={classnames(styles.laneDescription)}>{laneDescription}</div>
              {!isDefaultLane && <div className={styles.laneName}>{laneName}</div>}
            </div>
          </div>
          <div className={styles.right}>
            {timestamp && (
              <div className={styles.timeStamp}>
                <TimeAgo date={timestamp?.toString()} />
              </div>
            )}
          </div>
        </div>
      </MenuLinkItem>
    </div>
  );
}
