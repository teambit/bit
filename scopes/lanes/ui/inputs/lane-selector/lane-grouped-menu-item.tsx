import React, { HTMLAttributes } from 'react';
import { LaneId } from '@teambit/lane-id';
import classnames from 'classnames';
import { LaneMenuItem } from './lane-menu-item';

import styles from './lane-grouped-menu-item.module.scss';

export type LaneGroupedMenuItemProps = {
  selected?: LaneId;
  current: LaneId[];
  scope: string;
  onLaneSelected?: (lane: LaneId) => () => void;
} & HTMLAttributes<HTMLDivElement>;

export function LaneGroupedMenuItem({
  selected,
  current,
  onLaneSelected,
  className,
  scope,
  ...rest
}: LaneGroupedMenuItemProps) {
  if (current.length === 0) return null;

  if (current[0].isDefault()) {
    const defaultLane = current[0] as LaneId;
    return (
      <LaneMenuItem
        key={defaultLane.toString()}
        selected={selected}
        current={defaultLane}
        onLaneSelected={onLaneSelected?.(defaultLane)}
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
          selected={selected}
          current={lane}
          onLaneSelected={onLaneSelected?.(lane)}
        />
      ))}
    </div>
  );
}
