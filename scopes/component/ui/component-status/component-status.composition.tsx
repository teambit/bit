import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { ComponentStatus } from './component-status';

export const ErrorComponentStatus = () => {
  return (
    <ThemeCompositions>
      <ComponentStatus status="error" />
    </ThemeCompositions>
  );
};

export const ModifiedComponentStatus = () => {
  return (
    <ThemeCompositions>
      <ComponentStatus status="modified" />
    </ThemeCompositions>
  );
};

export const NewComponentStatus = () => {
  return (
    <ThemeCompositions>
      <ComponentStatus status="new" />
    </ThemeCompositions>
  );
};

export const StagedComponentStatus = () => {
  return (
    <ThemeCompositions>
      <ComponentStatus status="staged" />
    </ThemeCompositions>
  );
};
