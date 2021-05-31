import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { EmptyScope } from './empty-scope';

export const EmptyScopeExample = () => {
  return (
    <ThemeCompositions>
      <EmptyScope name="bit.scope" />
    </ThemeCompositions>
  );
};
