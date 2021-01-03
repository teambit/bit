import React from 'react';
import { Router } from 'react-router-dom';
import { createBrowserHistory } from 'history';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { VersionDropdown } from './version-dropdown';

export const VersionDropdownWithOneVerion = () => {
  return (
    <ThemeCompositions>
      <VersionDropdown versions={['0.1']} currentVersion="0.1" />
    </ThemeCompositions>
  );
};

export const VersionDropdownWithMultipleVerions = () => {
  const history = createBrowserHistory();
  const versions = ['0.3', '0.2', '0.1'];
  return (
    <ThemeCompositions>
      <Router history={history}>
        <VersionDropdown versions={versions} currentVersion={versions[0]} />
      </Router>
    </ThemeCompositions>
  );
};

VersionDropdownWithOneVerion.canvas = {
  height: 90,
};

VersionDropdownWithMultipleVerions.canvas = {
  height: 90,
};
