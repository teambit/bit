import React, { HTMLAttributes } from 'react';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneId } from '@teambit/lane-id';
import { LaneSelector } from '@teambit/lanes.ui.inputs.lane-selector';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import classnames from 'classnames';

import styles from './lane-switcher.module.scss';

export type LaneSwitcherProps = {
  groupByScope?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function LaneSwitcher({ className, groupByScope = true, ...rest }: LaneSwitcherProps) {
  const { lanesModel } = useLanes();

  const mainLaneId = lanesModel?.getDefaultLane()?.id;
  const nonMainLaneIds = lanesModel?.getNonMainLanes().map((lane) => lane.id) || [];

  const lanes: Array<LaneId> = (mainLaneId && [mainLaneId, ...nonMainLaneIds]) || nonMainLaneIds;

  const selectedLaneId = lanesModel?.viewedLane?.id || mainLaneId;
  const selectedLaneGalleryHref = selectedLaneId && `${LanesModel.getLaneUrl(selectedLaneId)}/~gallery`;

  return (
    <div className={classnames(styles.laneSwitcherContainer, className)}>
      <LaneSelector
        selectedLaneId={selectedLaneId}
        className={styles.laneSelector}
        lanes={lanes}
        groupByScope={groupByScope}
        {...rest}
      />
      <MenuLinkItem className={styles.laneGalleryIcon} icon="comps" href={selectedLaneGalleryHref}></MenuLinkItem>
    </div>
  );
}
