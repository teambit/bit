import React from 'react';
import { Separator } from '@teambit/design.ui.separator';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import classNames from 'classnames';

import { LaneModel } from '@teambit/lanes.ui.lanes';
import { NavLink } from '@teambit/base-ui.routing.nav-link';
import styles from './lane-id.module.scss';

export type LaneIdProps = { lane?: LaneModel } & React.HTMLAttributes<HTMLDivElement>;

export function LaneId({ lane, className, ...rest }: LaneIdProps) {
  if (!lane) return null;

  return (
    <>
      <NavLink href={lane.url} className={styles.laneUrl}>
        <div {...rest} className={classNames(styles.lane, className)}>
          <Icon of="lane"></Icon>
          <Ellipsis className={styles.laneId}>{lane.id}</Ellipsis>
        </div>
      </NavLink>
      <Separator isPresentational />
    </>
  );
}
