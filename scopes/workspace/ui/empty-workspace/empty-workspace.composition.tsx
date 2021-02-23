import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { EmptyWorkspace } from './empty-workspace';

export const EmptyWorkspaceExample = () => {
  return (
    <ThemeCompositions>
      <EmptyWorkspace name="bit.workspace" />
    </ThemeCompositions>
  );
};
