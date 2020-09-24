import React from 'react';
import { Icon, IconProps } from '@teambit/evangelist.elements.icon';
import { ComponentModel } from '@teambit/component';

export type DeprecationIconProps = { component: ComponentModel } & Omit<IconProps, 'of'>;

export function DeprecationIcon({ component, ...rest }: DeprecationIconProps) {
  const isDeprecated = component.deprecation?.isDeprecate;
  if (!isDeprecated) return null;

  return <Icon {...rest} of="note-deprecated" />;
}
