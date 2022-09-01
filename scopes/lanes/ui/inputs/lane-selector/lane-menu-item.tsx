import React, { HTMLAttributes, useRef, useEffect } from 'react';
import classnames from 'classnames';
import { LaneId } from '@teambit/lane-id';

import styles from './lane-menu-item.module.scss';

export type LaneMenuItemProps = {
  selected?: LaneId;
  current: LaneId;
  onLaneSelected?: () => void;
} & HTMLAttributes<HTMLDivElement>;

export function LaneMenuItem({ selected, current, onLaneSelected, className, ...rest }: LaneMenuItemProps) {
  const isCurrent = selected?.toString() === current.toString();

  const currentVersionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isCurrent) {
      currentVersionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isCurrent]);

  return (
    <div
      {...rest}
      className={classnames(styles.menuItem, className, isCurrent && styles.current)}
      ref={currentVersionRef}
      onClick={onLaneSelected}
    >
      <div className={styles.laneName}>{current.name}</div>
    </div>
  );
}
