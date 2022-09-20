import React, { useContext } from 'react';
import classNames from 'classnames';
import { LaneIcon } from '@teambit/lanes.ui.icons.lane-icon';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { Link } from '@teambit/base-react.navigation.link';
import { ComponentContext } from '@teambit/component';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { useViewedLaneFromUrl } from '@teambit/lanes.hooks.use-viewed-lane-from-url';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { Separator } from '@teambit/design.ui.separator';

import styles from './lane-breadcrumb.module.scss';

export type LaneBreadcrumbProps = {
  withSeparator?: boolean;
  separatorClassName?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function LaneBreadcrumb({ withSeparator, separatorClassName, className, ...rest }: LaneBreadcrumbProps) {
  const component = useContext(ComponentContext);
  const { lanesModel } = useLanes();
  const isComponentOnLane = lanesModel?.isComponentOnNonDefaultLanes(component.id, true);

  const laneId = useViewedLaneFromUrl(true);

  if (!isComponentOnLane || !laneId) return null;

  const displayId = laneId.isDefault() ? laneId.name : laneId.toString();
  const href = LanesModel.getLaneUrl(laneId);

  return (
    <>
      <div {...rest} className={classNames(styles.lane, className)}>
        <LaneIcon />
        <Link href={href} className={styles.laneUrl}>
          <Ellipsis className={styles.laneId}>{displayId}</Ellipsis>
        </Link>
      </div>
      {withSeparator && <Separator isPresentational className={separatorClassName} />}
    </>
  );
}
