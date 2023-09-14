import React, { HTMLAttributes, useState, useEffect, useMemo } from 'react';
import { LaneCompareProps } from '@teambit/lanes';
import { UseLanes, useLanes as defaultUseLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneSelector } from '@teambit/lanes.ui.inputs.lane-selector';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';

import styles from './lane-compare-page.module.scss';

export type LaneComparePageProps = {
  getLaneCompare: (props: LaneCompareProps) => React.ReactNode;
  groupByScope?: boolean;
  useLanes?: UseLanes;
} & HTMLAttributes<HTMLDivElement>;

export function LaneComparePage({
  getLaneCompare,
  groupByScope,
  useLanes = defaultUseLanes,
  ...rest
}: LaneComparePageProps) {
  const { lanesModel, loading, fetchMoreLanes, hasMore, offset, limit } = useLanes(undefined, undefined, {
    offset: 0,
    limit: 10,
  });
  const [base, setBase] = useState<LaneModel | undefined>();
  const defaultLane = lanesModel?.getDefaultLane();
  const compare = lanesModel?.viewedLane;
  const nonMainLanes = lanesModel?.getNonMainLanes() || [];

  useEffect(() => {
    if (!base && !compare?.id.isDefault() && defaultLane) {
      setBase(defaultLane);
    }
    if (!base && compare?.id.isDefault() && (nonMainLanes?.length ?? 0) > 0) {
      setBase(nonMainLanes?.[0]);
    }
  }, [defaultLane, compare?.id.toString(), nonMainLanes?.length]);

  const LaneCompareComponent = getLaneCompare({ base, compare, groupBy: 'status' });

  const lanes: Array<LaneModel> = useMemo(() => {
    return nonMainLanes.filter((l) => l.toString() !== compare?.id.toString());
  }, [base?.id.toString(), compare?.id.toString(), nonMainLanes.length]);

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
            <img src="https://static.bit.dev/bit-icons/arrow-right.svg"></img>
          </div>
          <div className={styles.baseSelectorContainer}>
            <LaneSelector
              selectedLaneId={base.id}
              className={styles.baseSelector}
              nonMainLanes={lanes}
              mainLane={defaultLane}
              groupByScope={groupByScope}
              getHref={() => ''}
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
