import React from 'react';
import { ComponentModel } from '../../../../extensions/component/ui';

interface ComponentIconProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  component: ComponentModel;
}

export function ComponentIcon({ component, ...rest }: ComponentIconProps) {
  const icon = component.environment?.icon;
  const envId = component.environment?.id;
  if (!icon) return null;

  return <img {...rest} src={icon} alt={envId} />;
}
