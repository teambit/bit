import React, { HTMLAttributes } from 'react';

export type LaneComparePageProps = {} & HTMLAttributes<HTMLDivElement>;

export function LaneComparePage({ ...rest }: LaneComparePageProps) {
  return <div {...rest}>Lane Compare Page</div>;
}
