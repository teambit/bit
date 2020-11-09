import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { NoComponents } from './no-components';

export const NoComponentsExample = () => {
  return (
    <ThemeContext>
      <NoComponents name="bit.scope" />
    </ThemeContext>
  );
};
