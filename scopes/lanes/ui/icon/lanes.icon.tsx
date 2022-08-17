import React, { HTMLAttributes } from 'react';

import { Icon } from '@teambit/evangelist.elements.icon';

export type LanesIconProps = {} & HTMLAttributes<HTMLSpanElement>;

export function LanesIcon({ className, ...rest }: LanesIconProps) {
  return <Icon {...rest} className={className} of="lane"></Icon>;
}
