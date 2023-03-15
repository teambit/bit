import React, { HTMLAttributes } from 'react';
import { LaneId } from '@teambit/lane-id';
import classnames from 'classnames';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { LaneMenuItem } from './lane-menu-item';

import styles from './lane-grouped-menu-item.module.scss';

export type LaneGroupedMenuItemProps = {
  selected?: LaneId;
  current: LaneModel[];
  scope: string;
  getHref?: (laneId: LaneId) => string;
  onLaneSelected?: (laneId: LaneId) => void;
} & HTMLAttributes<HTMLDivElement>;

export function LaneGroupedMenuItem({
  selected,
  current,
  className,
  scope,
  getHref,
  onLaneSelected,
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
        {scope}
      </div>
      {current.map((lane) => (
        <LaneMenuItem
          key={lane.toString()}
          onLaneSelected={onLaneSelected}
          getHref={getHref}
          selected={selected}
          current={lane}
        />
      ))}
    </div>
  );
}
