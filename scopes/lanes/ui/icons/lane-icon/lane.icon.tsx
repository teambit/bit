import React, { HTMLAttributes } from 'react';

import { Icon } from '@teambit/evangelist.elements.icon';

export type LaneIconProps = {} & HTMLAttributes<HTMLSpanElement>;

export function LaneIcon({ className, ...rest }: LaneIconProps) {
  return <Icon {...rest} className={className} of="lane"></Icon>;
}
