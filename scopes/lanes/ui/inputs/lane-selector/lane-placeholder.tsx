import React, { HTMLAttributes } from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { LaneIcon } from '@teambit/lanes.ui.icons.lane-icon';
import { LaneId } from '@teambit/lane-id';
import classnames from 'classnames';

import styles from './lane-placeholder.module.scss';

export type LanePlaceholderProps = { selectedLaneId: LaneId } & HTMLAttributes<HTMLDivElement>;

export function LanePlaceholder({ selectedLaneId, className, ...rest }: LanePlaceholderProps) {
  const laneIdStr = selectedLaneId?.isDefault() ? selectedLaneId.name : selectedLaneId?.toString();

  return (
    <div {...rest} className={classnames(styles.placeholder, className)}>
      <LaneIcon className={styles.icon} />
      <span className={styles.placeholderText}>{laneIdStr}</span>
      <Icon of="fat-arrow-down" />
    </div>
  );
}
