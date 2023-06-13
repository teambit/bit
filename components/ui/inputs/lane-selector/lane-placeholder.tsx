import React, { HTMLAttributes } from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { LaneIcon } from '@teambit/lanes.ui.icons.lane-icon';
import { LaneId } from '@teambit/lane-id';
import classnames from 'classnames';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';

import styles from './lane-placeholder.module.scss';

export type LanePlaceholderProps = {
  selectedLaneId?: LaneId;
  disabled?: boolean;
  showScope?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function LanePlaceholder({
  selectedLaneId,
  disabled,
  className,
  showScope = true,
  ...rest
}: LanePlaceholderProps) {
  const laneIdStr = selectedLaneId?.isDefault()
    ? selectedLaneId.name
    : (showScope && selectedLaneId?.toString()) || selectedLaneId?.name;

  return (
    <div {...rest} className={classnames(styles.placeholder, className, disabled && styles.disabled)}>
      <LaneIcon className={styles.icon} />
      <Ellipsis className={styles.placeholderText}>{laneIdStr}</Ellipsis>
      {!disabled && <Icon of="fat-arrow-down" />}
    </div>
  );
}
