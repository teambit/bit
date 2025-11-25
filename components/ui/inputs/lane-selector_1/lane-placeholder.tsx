import type { HTMLAttributes } from 'react';
import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { LaneIcon } from '@teambit/lanes.ui.icons.lane-icon';
import type { LaneId } from '@teambit/lane-id';
import classnames from 'classnames';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';

import styles from './lane-placeholder.module.scss';

export type LanePlaceholderProps = {
  selectedLaneId?: LaneId;
  disabled?: boolean;
  showScope?: boolean;
  loading?: boolean;
  placeholderText?: string;
} & HTMLAttributes<HTMLDivElement>;

export function LanePlaceholder({
  selectedLaneId,
  disabled,
  className,
  showScope = true,
  loading,
  placeholderText: placeholderTextFromProps,
  ...rest
}: LanePlaceholderProps) {
  const nothingSelected = !selectedLaneId;
  const laneIdStr = selectedLaneId?.isDefault()
    ? selectedLaneId.name
    : (showScope && selectedLaneId?.toString()) || selectedLaneId?.name;
  const placeholderText = nothingSelected ? placeholderTextFromProps || 'Select lane' : laneIdStr;

  if (loading) {
    return null;
  }

  return (
    <div {...rest} className={classnames(styles.placeholder, className, disabled && styles.disabled)}>
      <LaneIcon className={styles.icon} />
      <Ellipsis className={styles.placeholderText}>{placeholderText}</Ellipsis>
      {!disabled && <Icon of="fat-arrow-down" />}
    </div>
  );
}
