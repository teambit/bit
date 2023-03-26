import React, { HTMLAttributes } from 'react';
import classnames from 'classnames';
import { LaneId } from '@teambit/lane-id';
import { LaneModel, LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { UserAvatar } from '@teambit/design.ui.avatar';
import { TimeAgo } from '@teambit/design.ui.time-ago';

import styles from './lane-menu-item.module.scss';

export type LaneMenuItemProps = {
  selected?: LaneId;
  current: LaneModel;
  getHref?: (laneId: LaneId) => string;
  onLaneSelected?: (laneId: LaneId) => void;
  icon?: React.ReactNode;
  timestamp?: Date;
} & HTMLAttributes<HTMLDivElement>;

export function LaneMenuItem({
  selected,
  current,
  className,
  onLaneSelected,
  getHref = LanesModel.getLaneUrl,
  icon,
  timestamp,
  ...rest
}: LaneMenuItemProps) {
  const isCurrent = selected?.toString() === current.id.toString();
  const isDefaultLane = current.id.isDefault();
  const iconWithDefault: React.ReactNode =
    icon || (isDefaultLane ? <img src="https://static.bit.cloud/bit-icons/changed-components.svg" /> : undefined);

  const href = getHref(current.id);

  const onClick = () => {
    onLaneSelected?.(current.id);
  };

  const laneDisplayName = current.displayName || current.id.name;
  const laneName = current.id.name;
  const user = current.updatedBy || current.createdBy;

  const avatar = iconWithDefault || (
    <UserAvatar
      size={24}
      account={{
        name: user?.name?.split(' ')[0],
        displayName: user?.name,
        profileImage: user?.profileImage,
      }}
    />
  );

  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  };
  const formattedTimestamp = timestamp?.toLocaleString(undefined, options).replace(',', '');

  return (
    <div {...rest} className={classnames(className, styles.laneMenuItemContainer)}>
      <MenuLinkItem active={isCurrent} href={href} className={styles.menuItem} onClick={onClick}>
        <div className={styles.laneContainer}>
          <div className={classnames(styles.top, isDefaultLane && styles.mainLane)}>
            <div className={classnames(styles.icon, isDefaultLane && !icon && styles.defaultMainLaneIcon)}>
              {avatar}
            </div>
            <div className={classnames(styles.laneDisplayName)}>{laneDisplayName}</div>
          </div>
          <div className={styles.bottom}>
            {!isDefaultLane && <div className={styles.laneName}>{laneName}</div>}

            {formattedTimestamp && (
              <div className={styles.timeStamp}>
                <TimeAgo date={formattedTimestamp} />
              </div>
            )}
          </div>
        </div>
      </MenuLinkItem>
    </div>
  );
}
