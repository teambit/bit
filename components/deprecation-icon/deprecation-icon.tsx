import React from 'react';
import classnames from 'classnames';
import { Icon, IconProps } from '@teambit/evangelist.elements.icon';
import { ComponentModel } from '@teambit/component';
import { colorPalette } from '@teambit/base-ui.theme.color-palette';
import { themedText } from '@teambit/base-ui.text.themed-text';

export type DeprecationIconProps = { component: ComponentModel } & Omit<IconProps, 'of'>;

export function DeprecationIcon({ component, ...rest }: DeprecationIconProps) {
  const isDeprecated = component.deprecation?.isDeprecate;
  if (!isDeprecated) return null;

  return <Icon {...rest} of="note-deprecated" className={classnames(themedText, colorPalette.hunger)} />;
}
