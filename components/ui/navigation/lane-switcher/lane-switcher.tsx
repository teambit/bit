import React, { HTMLAttributes, useEffect, useState, useRef } from 'react';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneSelector, LaneSelectorSortBy } from '@teambit/lanes.ui.inputs.lane-selector';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import classnames from 'classnames';

import styles from './lane-switcher.module.scss';

export type LaneSwitcherProps = {
  groupByScope?: boolean;
  sortBy?: LaneSelectorSortBy;
  sortOptions?: LaneSelectorSortBy[];
  mainIcon?: () => React.ReactNode;
  scopeIcon?: (scopeName: string) => React.ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export function LaneSwitcher({
  className,
  groupByScope = false,
  mainIcon,
  scopeIcon,
  sortBy,
  sortOptions,
  ...rest
}: LaneSwitcherProps) {
  const { lanesModel } = useLanes();
  const [viewedLane, setViewedLane] = useState(lanesModel?.viewedLane);
  const containerRef = useRef<HTMLDivElement>(null);

  const mainLane = lanesModel?.getDefaultLane();
  const nonMainLanes = lanesModel?.getNonMainLanes() || [];

  const scopeIconLookup = new Map<string, React.ReactNode>(
    groupByScope
      ? nonMainLanes.map(({ id: { scope } }) => {
          const icon = scopeIcon?.(scope) ?? null;
          return [scope, icon];
        })
      : []
  );

  useEffect(() => {
    if (lanesModel?.viewedLane?.id.toString() !== viewedLane?.id.toString()) {
      setViewedLane(lanesModel?.viewedLane);
    }
  }, [lanesModel?.viewedLane?.id.toString()]);

  const selectedLane = viewedLane || mainLane;
  const selectedLaneGalleryHref = selectedLane && LanesModel.getLaneUrl(selectedLane.id);

  return (
    <div className={classnames(styles.laneSwitcherContainer, className)} ref={containerRef}>
      <div className={styles.laneSelectorContainer}>
        <LaneSelector
          selectedLaneId={selectedLane?.id}
          nonMainLanes={nonMainLanes}
          mainLane={mainLane}
          mainIcon={mainIcon?.()}
          scopeIcon={scopeIcon}
          groupByScope={groupByScope}
          sortBy={sortBy}
          sortOptions={sortOptions}
          scopeIconLookup={scopeIconLookup}
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
