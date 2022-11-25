import React, { HTMLAttributes } from 'react';
import { LaneCompare } from '@teambit/lanes.ui.compare.lane-compare';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { CodeCompareSection } from '@teambit/code';
import { AspectsCompareSection } from '@teambit/component-compare';

import styles from './lane-compare-page.module.scss';

export type LaneComparePageProps = {
  host: string;
} & HTMLAttributes<HTMLDivElement>;

export function LaneComparePage({ host, ...rest }: LaneComparePageProps) {
  const { lanesModel } = useLanes();

  if (!lanesModel) return null;

  const code = new CodeCompareSection();
  const aspect = new AspectsCompareSection(host);

  const tabs = [
    {
      order: code.navigationLink.order,
      props: code.navigationLink,
      id: code.navigationLink.children,
      element: code.route.element,
    },
    {
      order: aspect.navigationLink.order,
      props: aspect.navigationLink,
      id: aspect.navigationLink.children,
      element: aspect.route.element,
    },
  ];

  const baseLane = lanesModel.lanes[0];
  const compareLane = lanesModel.lanes[1] || baseLane;

  return (
    <div {...rest} className={styles.laneComparePage}>
      <div className={styles.top}>{`Comparing Lane ${baseLane.id.toString()} with ${compareLane.id.toString()}`}</div>
      <div className={styles.bottom}>
        <LaneCompare host={host} tabs={tabs} base={baseLane} compare={compareLane} />
      </div>
    </div>
  );
}
