import React from 'react';
import { ComponentModel } from '@teambit/component';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { DeprecationIcon } from './deprecation-icon';

export const DeprecationIconIsDeprecate = () => {
  const deprecation = {
    isDeprecate: true,
  };
  const component = new ComponentModel(
    // @ts-ignore
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    deprecation,
    null,
    null
  );
  return (
    <ThemeCompositions>
      <DeprecationIcon component={component} />
    </ThemeCompositions>
  );
};
