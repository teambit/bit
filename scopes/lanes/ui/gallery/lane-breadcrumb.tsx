import React from 'react';
import classNames from 'classnames';
import { LanesIcon } from '@teambit/lanes.ui.icon';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { Link } from '@teambit/base-react.navigation.link';

import { LaneModel, LanesModel } from '@teambit/lanes.ui.models';

import styles from './lane-breadcrumb.module.scss';

export type LaneBreadcrumbProps = { lane?: LaneModel } & React.HTMLAttributes<HTMLDivElement>;

export function LaneBreadcrumb({ lane, className, ...rest }: LaneBreadcrumbProps) {
  if (!lane) return null;

  return (
    <Link href={LanesModel.getLaneUrl(lane.id)} className={styles.laneUrl}>
      <div {...rest} className={classNames(styles.lane, className)}>
        <LanesIcon />
        <Ellipsis className={styles.laneId}>{lane.id}</Ellipsis>
      </div>
    </Link>
  );
}
