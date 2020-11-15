import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { EmptyWorkspace } from './empty-workspace';

export const EmptyWorkspaceExample = () => {
  return (
    <ThemeContext>
      <EmptyWorkspace name="bit.workspace" />
    </ThemeContext>
  );
};
