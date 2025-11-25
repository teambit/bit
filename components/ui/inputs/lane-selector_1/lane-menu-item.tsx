import type { HTMLAttributes } from 'react';
import React, { forwardRef } from 'react';
import classnames from 'classnames';
import type { LaneId } from '@teambit/lane-id';
import type { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { UserAvatar } from '@teambit/design.ui.avatar';
import { TimeAgo } from '@teambit/design.ui.time-ago';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { Icon } from '@teambit/design.elements.icon'
import styles from './lane-menu-item.module.scss';

export type LaneMenuItemProps = {
  selected?: LaneId;
  current: LaneModel;
  getHref?: (laneId: LaneId) => string;
  onLaneSelected?: (laneId: LaneId, lane: LaneModel) => void;
  icon?: React.ReactNode;
  timestamp?: Date;
} & HTMLAttributes<HTMLDivElement>;

// TODO: @luv please fix the eslint error
// eslint-disable-next-line react/display-name
export const LaneMenuItem = forwardRef<HTMLDivElement, LaneMenuItemProps>(
  (
    {
      selected,
      current,
      className,
      onLaneSelected,
      getHref = LanesModel.getLaneUrl,
      icon,
      timestamp,
      ...rest
    }: LaneMenuItemProps,
    ref
  ) => {
    const isCurrent = selected?.toString() === current.id.toString();
    const isDefaultLane = current.id.isDefault();
    const defaultIcon = <Icon of="changed-components" />;
    const iconWithDefault = icon || (isDefaultLane ? defaultIcon : undefined);
    const href = getHref(current.id);

    const onClick = () => {
      onLaneSelected?.(current.id, current);
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

    const formattedTimestamp = timestamp?.toString();

    return (
      <div {...rest} ref={ref} className={classnames(className, styles.laneMenuItemContainer)}>
        <MenuLinkItem active={isCurrent} href={href} className={styles.menuItem} onClick={onClick}>
          <div className={styles.laneContainer}>
            <div className={classnames(styles.top, isDefaultLane && styles.mainLane)}>
              <div className={classnames(styles.icon, isDefaultLane && !icon && styles.defaultMainLaneIcon)}>
                {avatar}
              </div>
              <div className={classnames(styles.laneDisplayName)}>{laneDisplayName}</div>
            </div>
            <div className={styles.bottom}>
              {!isDefaultLane && <Ellipsis className={styles.laneName}>{laneName}</Ellipsis>}

              {formattedTimestamp && (
                <div className={styles.timeStamp}>
                  <TimeAgo date={formattedTimestamp} className={styles.laneUpdated} />
                </div>
              )}
            </div>
          </div>
        </MenuLinkItem>
      </div>
    );
  }
);
