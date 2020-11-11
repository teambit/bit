import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { EmptyScope } from './empty-scope';

export const EmptyScopeExample = () => {
  return (
    <ThemeContext>
      <EmptyScope name="bit.scope" />
    </ThemeContext>
  );
};
