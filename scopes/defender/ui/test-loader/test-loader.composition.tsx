import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { TestLoader } from './test-loader';

export function TestLoaderExample() {
  return (
    <ThemeContext>
      <TestLoader />
    </ThemeContext>
  );
}
