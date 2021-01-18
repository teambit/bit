import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { VersionLabel } from './version-label';

export const VersionLabelLatest = () => {
  return (
    <ThemeCompositions>
      <VersionLabel status="latest" />
    </ThemeCompositions>
  );
};

export const VersionLabelCheckedOut = () => {
  return (
    <ThemeCompositions>
      <VersionLabel status="checked-out" />
    </ThemeCompositions>
  );
};
