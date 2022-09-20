import React from 'react';
import classNames from 'classnames';
import { LaneIcon } from '@teambit/lanes.ui.icons.lane-icon';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { Link } from '@teambit/base-react.navigation.link';

import { LaneModel, LanesModel } from '@teambit/lanes.ui.models.lanes-model';

import styles from './lane-breadcrumb.module.scss';

export type LaneBreadcrumbProps = { lane?: LaneModel } & React.HTMLAttributes<HTMLDivElement>;

export function LaneBreadcrumb({ lane, className, ...rest }: LaneBreadcrumbProps) {
  if (!lane) return null;

  const displayId = lane.id.isDefault() ? lane.id.name : lane.id.toString();

  return (
    <Link href={LanesModel.getLaneUrl(lane.id)} className={styles.laneUrl}>
      <div {...rest} className={classNames(styles.lane, className)}>
        <LaneIcon />
        <Ellipsis className={styles.laneId}>{displayId}</Ellipsis>
      </div>
    </Link>
  );
}
