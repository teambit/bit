import React from 'react';
import { ComponentModel } from '@teambit/component';

export type EnvIconProps = { component: ComponentModel } & React.HTMLAttributes<HTMLImageElement>;

export function EnvIcon({ component, ...rest }: EnvIconProps) {
  if (!component || !component.environment?.icon) return null;

  return <img {...rest} src={component.environment?.icon} alt={component.environment.id} />;
}
