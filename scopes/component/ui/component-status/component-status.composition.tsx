import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { ComponentStatus } from './component-status';

export const ErrorComponentStatus = () => {
  return (
    <ThemeContext>
      <ComponentStatus status="error" />
    </ThemeContext>
  );
};

export const ModifiedComponentStatus = () => {
  return (
    <ThemeContext>
      <ComponentStatus status="modified" />
    </ThemeContext>
  );
};

export const NewComponentStatus = () => {
  return (
    <ThemeContext>
      <ComponentStatus status="new" />
    </ThemeContext>
  );
};

export const StagedComponentStatus = () => {
  return (
    <ThemeContext>
      <ComponentStatus status="staged" />
    </ThemeContext>
  );
};
