import React from 'react';
import { ComponentModel } from '@teambit/component';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { DeprecationIcon } from './deprecation-icon';

export const DeprecationIconIsDeprecate = () => {
  const deprecation = {
    isDeprecate: true,
  };
  // @ts-ignore
  const component = new ComponentModel(null, null, null, null, null, null, null, null, deprecation, null, null);
  return (
    <ThemeCompositions>
      <DeprecationIcon component={component} />
    </ThemeCompositions>
  );
};

export const DeprecationIconIsNotDeprecate = () => {
  const deprecation = {
    isDeprecate: false,
  };
  // @ts-ignore
  const component = new ComponentModel(null, null, null, null, null, null, null, null, deprecation, null, null);
  return <DeprecationIcon component={component} />;
};

DeprecationIconIsDeprecate.canvas = {
  height: 90,
};
