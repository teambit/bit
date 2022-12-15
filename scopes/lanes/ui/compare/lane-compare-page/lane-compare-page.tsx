import React, { HTMLAttributes } from 'react';
import { LaneCompareProps } from '@teambit/lanes';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';

import styles from './lane-compare-page.module.scss';

export type LaneComparePageProps = {
  getLaneCompare: (props: LaneCompareProps) => React.ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export function LaneComparePage({ getLaneCompare, ...rest }: LaneComparePageProps) {
  const { lanesModel } = useLanes();

  if (!lanesModel) return null;

  const base = lanesModel.lanes.find((l) => l.id.name === 'bit-cloud');
  const compare = lanesModel.lanes.find((l) => l.id.name === 'lane-compare');

  const LaneCompareComponent = getLaneCompare({ base, compare });

  return (
    <div {...rest} className={styles.laneComparePage}>
      <div className={styles.top}>{`Comparing Lane ${compare?.id.toString()} with ${base?.id.toString()}`}</div>
      {LaneCompareComponent}
    </div>
  );
}
