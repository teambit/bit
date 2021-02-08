import React, { forwardRef } from 'react';
import { ComponentModel } from '@teambit/component';

export type EnvIconProps = { component: ComponentModel } & React.HTMLAttributes<HTMLImageElement>;

export const EnvIcon = forwardRef<HTMLImageElement, EnvIconProps>(function EnvIcon(
  { component, ...rest }: EnvIconProps,
  ref
) {
  if (!component || !component.environment?.icon) return <span />;

  return <img ref={ref} {...rest} src={component.environment?.icon} alt={component.environment.id} />;
});
