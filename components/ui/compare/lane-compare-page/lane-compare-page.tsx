import React, { useState, useEffect, useMemo } from 'react';
import type { HTMLAttributes } from 'react';
import type { LaneCompareProps, LanesModel } from '@teambit/lanes';
import { useLanes as defaultUseLanes } from '@teambit/lanes.hooks.use-lanes';
import type { UseLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneSelector } from '@teambit/lanes.ui.inputs.lane-selector';
import type { LaneModel } from '@teambit/lanes.ui.models.lanes-model';

import styles from './lane-compare-page.module.scss';

export type LaneComparePageProps = {
  getLaneCompare: (props: LaneCompareProps) => React.ReactNode;
  // TODO:fix this and enable the eslint rule
  // eslint-disable-next-line react/require-default-props
  groupByScope?: boolean;
  // TODO:fix this and enable the eslint rule
  // eslint-disable-next-line react/require-default-props
  useLanes?: UseLanes;
  // TODO:fix this and enable the eslint rule
  // eslint-disable-next-line react/require-default-props
  searchLanes?: (search?: string) => LanesModel | undefined | null;
} & HTMLAttributes<HTMLDivElement>;

export function LaneComparePage({
  getLaneCompare,
  groupByScope = false,
  // @ts-ignore TODO fix with luv.
  useLanes = defaultUseLanes,
  searchLanes,
  ...rest
}: LaneComparePageProps) {
  const { lanesModel, loading, fetchMoreLanes, hasMore, offset, limit } = useLanes();
  const [base, setBase] = useState<LaneModel | undefined>();
  const defaultLane = lanesModel?.getDefaultLane();
  const compare = lanesModel?.viewedLane;
  const nonMainLanes = lanesModel?.getNonMainLanes() || [];
  useEffect(() => {
    if (!base && !compare?.id.isDefault() && defaultLane) {
      setBase(defaultLane);
    }
    if (!base && compare?.id.isDefault() && (nonMainLanes?.length ?? 0) > 0) {
      const firstActive = nonMainLanes.find((l) => !l.deleted);
      if (firstActive) setBase(firstActive);
    }
  }, [defaultLane, compare?.id.toString(), nonMainLanes?.length]);

  const LaneCompareComponent = getLaneCompare({ base, compare, groupBy: 'status' });

  const lanes: Array<LaneModel> = useMemo(() => {
    return nonMainLanes.filter((l) => l.toString() !== compare?.id.toString() && !l.deleted);
  }, [base?.id.toString(), compare?.id.toString(), lanesModel?.lanes.length]);

  useEffect(() => {
    const collapser = document.querySelector('[class*="collapser"]') as HTMLElement;
    const splitPane = document.querySelector('[class*="splitPane"]') as HTMLElement;
    if (!collapser || !splitPane) return;

    const firstPane = splitPane.firstElementChild as HTMLElement;
    const wasOpen = firstPane && firstPane.offsetWidth > 50;

    if (wasOpen) {
      firstPane.style.display = 'none';
      requestAnimationFrame(() => {
        collapser.click();
        requestAnimationFrame(() => {
          firstPane.style.display = '';
        });
      });
    }

    return () => {
      if (wasOpen) {
        const pane = splitPane.firstElementChild as HTMLElement;
        if (pane && pane.offsetWidth <= 50) collapser.click();
      }
    };
  }, []);

  if (!lanesModel) return null;
  if (!lanesModel.viewedLane) return null;
  if (!base) return null;

  return (
    <div {...rest} className={styles.laneComparePage}>
      <div className={styles.top}>
        <div className={styles.subTitle}>Compare</div>
        <div className={styles.title}>
          <div className={styles.compareLane}>{compare?.id.name}</div>
          <div className={styles.rightIcon}>
            <img src="https://static.bit.dev/bit-icons/arrow-right.svg" alt="arrow-right" />
          </div>
          <div className={styles.baseSelectorContainer}>
            <LaneSelector
              // @ts-ignore
              searchLanes={searchLanes}
              selectedLaneId={base.id}
              className={styles.baseSelector}
              nonMainLanes={lanes}
              mainLane={defaultLane}
              groupByScope={groupByScope}
              // getHref: returning ' ' (space) keeps the LaneSelector menu item interactive.
              // It's truthy, so it's accepted as a valid href.
              // It appends a trailing '/' to the path without affecting routing or triggering navigation.
              getHref={() => ' '}
              onLaneSelected={(_, lane) => {
                setBase(lane);
              }}
              loading={loading}
              fetchMoreLanes={fetchMoreLanes}
              hasMore={hasMore}
              initialOffset={(offset ?? 0) + (limit ?? 0)}
            />
          </div>
        </div>
      </div>
      <div className={styles.bottom}>{LaneCompareComponent}</div>
    </div>
  );
}
