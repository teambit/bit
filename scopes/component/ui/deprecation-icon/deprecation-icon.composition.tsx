import React from 'react';
import { ComponentModel } from '@teambit/component';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { DeprecationIcon } from './deprecation-icon';

export const DeprecationIconIsDeprecate = () => {
  const deprecation = {
    isDeprecate: true,
  };
  // @ts-ignore
  const component = new ComponentModel(null, null, null, null, null, null, null, null, deprecation, null, null);
  return (
    <ThemeContext>
      <DeprecationIcon component={component} />
    </ThemeContext>
  );
};

export const DeprecationIconIsNotDeprecate = () => {
  const deprecation = {
    isDeprecate: false,
  };
  // @ts-ignore
  const component = new ComponentModel(null, null, null, null, null, null, null, null, deprecation, null, null);
  return (
    <ThemeContext>
      <DeprecationIcon component={component} />
    </ThemeContext>
  );
};
