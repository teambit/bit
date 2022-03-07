import { LaneModel } from '@teambit/lanes.ui.lanes';
import classNames from 'classnames';
import React from 'react';
import { NavLink } from '@teambit/base-ui.routing.nav-link';
import { Icon } from '@teambit/evangelist.elements.icon';
import styles from './lane-info.module.scss';

export type LaneInfoProps = LaneModel & { currentLane?: LaneModel };

export function LaneInfo({ id, url, currentLane }: LaneInfoProps) {
  const isCurrent = currentLane?.id === id;

  return (
    <div key={id}>
      <NavLink
        href={url}
        className={classNames(styles.versionLine, styles.versionRow, isCurrent && styles.currentVersion)}
      >
        <span>
          <Icon className={styles.laneIcon} of="lane"></Icon>
          {id}
        </span>
      </NavLink>
    </div>
  );
}
