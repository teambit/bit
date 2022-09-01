import React, { HTMLAttributes } from 'react';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneId } from '@teambit/lane-id';
import { LaneSelector } from '@teambit/lanes.ui.inputs.lane-selector';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';

import styles from './lane-switcher.module.scss';

export type LaneSwitcherProps = {
  groupByScope?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function LaneSwitcher({ className, groupByScope = true, ...rest }: LaneSwitcherProps) {
  const { lanesModel, updateLanesModel } = useLanes();

  const mainLaneId = lanesModel?.getDefaultLane()?.id;
  const nonMainLaneIds = lanesModel?.getNonMainLanes().map((lane) => lane.id) || [];

  const lanes: Array<LaneId> = (mainLaneId && [mainLaneId, ...nonMainLaneIds]) || [];

  const selectedLaneId = lanesModel?.viewedLane?.id;

  const onLaneSelected = (laneId) => () => {
    lanesModel?.setViewedLane(laneId);
    updateLanesModel?.(lanesModel);
  };

  if (!selectedLaneId) return null;

  return (
    <div className={styles.laneSwitcherContainer}>
      <LaneSelector
        selectedLaneId={selectedLaneId}
        className={className}
        lanes={lanes}
        onLaneSelected={onLaneSelected}
        groupByScope={groupByScope}
        {...rest}
      />
      <MenuLinkItem icon="comps" href={LanesModel.getLaneUrl(selectedLaneId)}></MenuLinkItem>
    </div>
  );
}
