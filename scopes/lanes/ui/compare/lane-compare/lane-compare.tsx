import React, { HTMLAttributes } from 'react';

export type LaneCompareProps = {} & HTMLAttributes<HTMLDivElement>;

export function LaneCompare({ ...rest }: LaneCompareProps) {
  return <div {...rest}>Lane Compare Page</div>;
}
