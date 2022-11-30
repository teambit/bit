import React, { HTMLAttributes } from 'react';
import { LaneCompareProps } from '@teambit/lanes';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';

import styles from './lane-compare-page.module.scss';

export type LaneComparePageProps = {
  getLaneCompare: (props: LaneCompareProps) => JSX.Element;
} & HTMLAttributes<HTMLDivElement>;

export function LaneComparePage({ getLaneCompare, ...rest }: LaneComparePageProps) {
  const { lanesModel } = useLanes();

  if (!lanesModel) return null;

  const base = lanesModel.getDefaultLane() || lanesModel.lanes[0];
  const compare = lanesModel.getNonMainLanes()[0] || base;
  const LaneCompareComponent = getLaneCompare({ base, compare });

  return (
    <div {...rest} className={styles.laneComparePage}>
      <div className={styles.top}>{`Comparing Lane ${compare.id.toString()} with ${base.id.toString()}`}</div>
      {LaneCompareComponent}
    </div>
  );
}
