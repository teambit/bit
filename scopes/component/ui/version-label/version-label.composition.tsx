import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { VersionLabel } from './version-label';

export const VersionLabelLatest = () => {
  return (
    <ThemeContext>
      <VersionLabel status="latest" />
    </ThemeContext>
  );
};

export const VersionLabelCheckedOut = () => {
  return (
    <ThemeContext>
      <VersionLabel status="checked-out" />
    </ThemeContext>
  );
};
