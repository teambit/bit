import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { Link } from '@teambit/base-react.navigation.link';

import { LaneModel, LanesModel } from '@teambit/lanes.ui.lanes';

import styles from './lane-breadcrumb.module.scss';

export type LaneBreadcrumbProps = { lane?: LaneModel } & React.HTMLAttributes<HTMLDivElement>;

export function LaneBreadcrumb({ lane, className, ...rest }: LaneBreadcrumbProps) {
  if (!lane) return null;

  return (
    <Link href={LanesModel.getLaneUrl(lane.id)} className={styles.laneUrl}>
      <div {...rest} className={classNames(styles.lane, className)}>
        <Icon of="lane"></Icon>
        <Ellipsis className={styles.laneId}>{lane.id}</Ellipsis>
      </div>
    </Link>
  );
}
