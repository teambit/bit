import React, { HTMLAttributes } from 'react';
import { UseLanes, useLanes as defaultUseLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneSelector } from '@teambit/lanes.ui.inputs.lane-selector';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import { LaneId } from '@teambit/lane-id';
import { WordSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { Icon } from '@teambit/design.elements.icon';
import classnames from 'classnames';

import styles from './lane-switcher.module.scss';

export type LaneSwitcherProps = {
  groupByScope?: boolean;
  mainIcon?: () => React.ReactNode;
  scopeIcon?: (scopeName: string) => React.ReactNode;
  useLanes?: UseLanes;
  getHref?: (lane: LaneId) => string;
  searchLanes?: (search?: string) => LanesModel | undefined | null;
} & HTMLAttributes<HTMLDivElement>;

function defaultSearchLanes(useLanes: UseLanes) {
  return function searchFn(search?: string) {
    // TODO: fix this and enable the eslint rule
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { searchResult } = useLanes(undefined, undefined, { search });
    if (searchResult?.loading) return undefined;
    if (!searchResult?.lanesModel) return null;
    return searchResult.lanesModel;
  };
}

export function LaneSwitcher({
  className,
  groupByScope = false,
  mainIcon,
  scopeIcon,
  useLanes = defaultUseLanes,
  searchLanes = defaultSearchLanes(useLanes),
  getHref = LanesModel.getLaneUrl,
  ...rest
}: LaneSwitcherProps) {
  const { lanesModel, loading, fetchMoreLanes, hasMore, offset, limit } = useLanes();

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

  const selectedLane = lanesModel?.viewedLane || mainLane;
  const selectedLaneGalleryHref = selectedLane && getHref(selectedLane.id);
  const MainIcon = mainIcon?.();

  return (
    <div className={classnames(styles.laneSwitcherContainer, className)}>
      <div className={styles.laneSelectorContainer}>
        {loading && <WordSkeleton className={styles.loader} length={20} />}
        <LaneSelector
          selectedLaneId={selectedLane?.id}
          nonMainLanes={nonMainLanes}
          mainLane={mainLane}
          mainIcon={MainIcon}
          groupByScope={groupByScope}
          // sortBy={sortBy}
          // sortOptions={sortOptions}
          scopeIconLookup={scopeIconLookup}
          getHref={getHref}
          loading={loading}
          fetchMoreLanes={fetchMoreLanes}
          hasMore={hasMore}
          initialOffset={(offset ?? 0) + (limit ?? 0)}
          searchLanes={searchLanes}
          {...rest}
        />
      </div>
      {!loading && (
        <div className={styles.laneIconContainer}>
          <MenuLinkItem exact className={styles.laneGalleryIcon} href={selectedLaneGalleryHref}>
            <Icon of="arrow-downwards-right-with-tip-rightwards" />
          </MenuLinkItem>
        </div>
      )}
    </div>
  );
}
