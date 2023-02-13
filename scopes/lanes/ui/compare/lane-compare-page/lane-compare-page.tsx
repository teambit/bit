import React, { HTMLAttributes, useState, useEffect, useMemo } from 'react';
import { LaneCompareProps } from '@teambit/lanes';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneSelector } from '@teambit/lanes.ui.inputs.lane-selector';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { LaneId } from '@teambit/lane-id';
import { LaneIcon } from '@teambit/lanes.ui.icons.lane-icon';

import styles from './lane-compare-page.module.scss';

export type LaneComparePageProps = {
  getLaneCompare: (props: LaneCompareProps) => React.ReactNode;
  groupByScope?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function LaneComparePage({ getLaneCompare, groupByScope, ...rest }: LaneComparePageProps) {
  const { lanesModel } = useLanes();
  const [base, setBase] = useState<LaneModel | undefined>();
  const defaultLane = lanesModel?.getDefaultLane();
  const compare = lanesModel?.viewedLane;
  const nonMainLanes = lanesModel?.getNonMainLanes();
  useEffect(() => {
    if (!base && !compare?.id.isDefault() && defaultLane) {
      setBase(defaultLane);
    }
    if (!base && compare?.id.isDefault() && (nonMainLanes?.length ?? 0) > 0) {
      setBase(nonMainLanes?.[0]);
    }
  }, [defaultLane, compare?.id.toString(), nonMainLanes?.length]);

  const LaneCompareComponent = getLaneCompare({ base, compare });

  const lanes: Array<LaneId> = useMemo(() => {
    const mainLaneId = defaultLane?.id;
    const nonMainLaneIds = nonMainLanes?.map((lane) => lane.id) || [];
    const allLanes = (mainLaneId && [mainLaneId, ...nonMainLaneIds]) || nonMainLaneIds;
    return allLanes.filter((l) => l.toString() !== compare?.id.toString());
  }, [base?.id.toString(), compare?.id.toString(), lanesModel?.lanes.length]);

  if (!lanesModel) return null;
  if (!lanesModel.viewedLane) return null;
  if (!base) return null;

  return (
    <div {...rest} className={styles.laneComparePage}>
      <div className={styles.top}>
        <div>Compare</div>
        <div className={styles.compareLane}>
          <LaneIcon className={styles.laneIcon} />
          {compare?.id.name}
        </div>
        <div>with</div>
        <div className={styles.baseSelectorContainer}>
          <LaneSelector
            selectedLaneId={base.id}
            className={styles.baseSelector}
            lanes={lanes}
            groupByScope={groupByScope}
            getHref={() => ''}
            onLaneSelected={(laneId) => {
              setBase(lanesModel?.lanes.find((l) => l.id.toString() === laneId.toString()));
            }}
          />
        </div>
      </div>
      <div className={styles.bottom}>{LaneCompareComponent}</div>
    </div>
  );
}
