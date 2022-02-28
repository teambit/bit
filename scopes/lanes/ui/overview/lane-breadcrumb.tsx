import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import classNames from 'classnames';

import { LaneModel } from '@teambit/lanes.ui.lanes';
import { NavLink } from '@teambit/base-ui.routing.nav-link';

import styles from './lane-breadcrumb.module.scss';

export type LaneBreadcrumbProps = { lane?: LaneModel } & React.HTMLAttributes<HTMLDivElement>;

export function LaneBreadcrumb({ lane, className, ...rest }: LaneBreadcrumbProps) {
  if (!lane) return null;

  return (
    <NavLink href={lane.url} className={styles.laneUrl}>
      <div {...rest} className={classNames(styles.lane, className)}>
        <Icon of="lane"></Icon>
        <Ellipsis className={styles.laneId}>{lane.id}</Ellipsis>
      </div>
    </NavLink>
  );
}
