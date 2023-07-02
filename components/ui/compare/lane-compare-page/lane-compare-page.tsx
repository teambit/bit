import React, { HTMLAttributes, useState, useEffect, useMemo } from 'react';
import { LaneCompareProps, LanesModel } from '@teambit/lanes';
import { useLanes as defaultUseLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneSelector } from '@teambit/lanes.ui.inputs.lane-selector';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';

import styles from './lane-compare-page.module.scss';

export type LaneComparePageProps = {
  getLaneCompare: (props: LaneCompareProps) => React.ReactNode;
  groupByScope?: boolean;
  useLanes?: () => { loading?: boolean; lanesModel?: LanesModel };
} & HTMLAttributes<HTMLDivElement>;

export function LaneComparePage({
  getLaneCompare,
  groupByScope,
  useLanes = defaultUseLanes,
  ...rest
}: LaneComparePageProps) {
  const { lanesModel } = useLanes();
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
    const allLanes = (defaultLane && [defaultLane, ...nonMainLanes]) || nonMainLanes;
    return allLanes.filter((l) => l.toString() !== compare?.id.toString());
  }, [base?.id.toString(), compare?.id.toString(), lanesModel?.lanes.length]);

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
              groupByScope={groupByScope}
              getHref={() => ''}
              forceCloseOnEnter={true}
              onLaneSelected={(laneId) => {
                setBase(lanesModel?.lanes.find((l) => l.id.toString() === laneId.toString()));
              }}
            />
          </div>
        </div>
      </div>
      <div className={styles.bottom}>{LaneCompareComponent}</div>
    </div>
  );
}
