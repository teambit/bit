import React from 'react';
import { Router } from 'react-router-dom';
import { createBrowserHistory } from 'history';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { VersionDropdown } from './version-dropdown';

const style = { display: 'flex', justifyContent: 'center', alignContent: 'center' };

export const VersionDropdownWithOneVersion = () => {
  return (
    <ThemeCompositions style={style}>
      <VersionDropdown tags={[{ version: '0.1' }]} currentVersion="0.1" />
    </ThemeCompositions>
  );
};

export const VersionDropdownWithMultipleVersions = () => {
  const history = createBrowserHistory();
  const versions = ['0.3', '0.2', '0.1'].map((version) => ({ version }));
  return (
    <ThemeCompositions style={style}>
      <Router history={history}>
        <VersionDropdown tags={versions} currentVersion={versions[0].version} />
      </Router>
    </ThemeCompositions>
  );
};
