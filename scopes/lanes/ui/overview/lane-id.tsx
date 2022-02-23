import React from 'react';
import { Separator } from '@teambit/design.ui.separator';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import classNames from 'classnames';

import styles from './lane-id.module.scss';

export type LaneIdProps = { laneId?: string } & React.HTMLAttributes<HTMLDivElement>;

export function LaneId({ laneId, className, ...rest }: LaneIdProps) {
  if (!laneId) return null;
  return (
    <>
      <div {...rest} className={classNames(styles.lane, className)}>
        <Icon of="lane"></Icon>
        <Ellipsis className={styles.laneId}>{laneId}</Ellipsis>
      </div>
      <Separator isPresentational />
    </>
  );
}
