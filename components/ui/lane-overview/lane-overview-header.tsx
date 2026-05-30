import React from 'react';
import classnames from 'classnames';
import type { LaneId } from '@teambit/lane-id';
import styles from './lane-overview-header.module.scss';

export type LaneOverviewHeaderProps = {
  laneId: LaneId;
  componentCount?: number;
  className?: string;
};

export function LaneOverviewHeader({ laneId, componentCount, className }: LaneOverviewHeaderProps) {
  const laneName = laneId.isDefault() ? laneId.name : laneId.toString();

  return (
    <div className={classnames(styles.header, className)}>
      <img src="https://static.bit.dev/bit-icons/lane.svg" className={styles.icon} alt="" />
      <span className={styles.name}>{laneName}</span>
      {componentCount !== undefined && (
        <span className={styles.count}>
          {componentCount} {componentCount === 1 ? 'component' : 'components'}
        </span>
      )}
    </div>
  );
}
