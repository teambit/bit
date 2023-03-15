import React, { HTMLAttributes, useEffect, useState, useRef } from 'react';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneSelector } from '@teambit/lanes.ui.inputs.lane-selector';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import classnames from 'classnames';

import styles from './lane-switcher.module.scss';

export type LaneSwitcherProps = {
  groupByScope?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function LaneSwitcher({
  className,
  // @todo implement grouped for workspace
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  groupByScope = false,
  ...rest
}: LaneSwitcherProps) {
  const { lanesModel } = useLanes();
  const [viewedLane, setViewedLane] = useState(lanesModel?.viewedLane);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lanesModel?.viewedLane?.id.toString() !== viewedLane?.id.toString()) {
      setViewedLane(lanesModel?.viewedLane);
    }
  }, [lanesModel?.viewedLane?.id.toString()]);

  const mainLane = lanesModel?.getDefaultLane();
  const nonMainLanes = lanesModel?.getNonMainLanes() || [];

  const selectedLane = viewedLane || mainLane;
  const selectedLaneGalleryHref = selectedLane && LanesModel.getLaneUrl(selectedLane.id);

  return (
    <div className={classnames(styles.laneSwitcherContainer, className)} ref={containerRef}>
      <div className={styles.laneSelectorContainer}>
        <LaneSelector
          selectedLaneId={selectedLane?.id}
          nonMainLanes={nonMainLanes}
          mainLane={mainLane}
          groupByScope={false}
          {...rest}
        />
      </div>
      <div className={styles.laneIconContainer}>
        <MenuLinkItem exact={true} className={styles.laneGalleryIcon} href={selectedLaneGalleryHref}>
          <img src="https://static.bit.dev/bit-icons/corner-up-left.svg" />
        </MenuLinkItem>
      </div>
    </div>
  );
}
