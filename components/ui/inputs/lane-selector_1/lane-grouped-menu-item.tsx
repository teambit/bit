import type { HTMLAttributes } from 'react';
import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import type { LaneId } from '@teambit/lane-id';
import classnames from 'classnames';
import type { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { LaneMenuItem } from './lane-menu-item';

import styles from './lane-grouped-menu-item.module.scss';

export type LaneGroupedMenuItemProps = {
  selected?: LaneId;
  current: LaneModel[];
  scope: string;
  getHref?: (laneId: LaneId) => string;
  onLaneSelected?: (laneId: LaneId, lane: LaneModel) => void;
  icon?: React.ReactNode;
  timestamp?: (lane: LaneModel) => Date | undefined;
  innerRefs?: (laneId: LaneId) => React.RefObject<HTMLDivElement> | undefined;
} & HTMLAttributes<HTMLDivElement>;

export function LaneGroupedMenuItem({
  selected,
  current,
  className,
  scope,
  timestamp,
  icon = <Icon className={styles.defaultScopeIcon} of="collection-full" />,
  getHref,
  onLaneSelected,
  innerRefs,
  ...rest
}: LaneGroupedMenuItemProps) {
  if (current.length === 0) return null;

  if (current.length === 1 && current[0].id.isDefault()) {
    const defaultLane = current[0];
    return (
      <LaneMenuItem
        key={defaultLane.toString()}
        onLaneSelected={onLaneSelected}
        getHref={getHref}
        selected={selected}
        current={defaultLane}
      />
    );
  }

  const onClickStopPropagation = (e) => e.stopPropagation();

  return (
    <div className={classnames(styles.groupedMenuItem, className)} {...rest}>
      <div onClick={onClickStopPropagation} className={styles.scope}>
        <div className={styles.scopeIcon}>{icon}</div>
        <div className={styles.scopeName}>{scope}</div>
      </div>
      {current.map((lane) => (
        <LaneMenuItem
          ref={innerRefs?.(lane.id)}
          key={lane.id.toString()}
          onLaneSelected={onLaneSelected}
          getHref={getHref}
          selected={selected}
          current={lane}
          timestamp={timestamp?.(lane)}
        />
      ))}
    </div>
  );
}
