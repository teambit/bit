import React from 'react';
import { Router } from 'react-router-dom';
import { createBrowserHistory } from 'history';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { VersionDropdown } from './version-dropdown';
import { Center } from './version-dropdown.docs';

export const VersionDropdownWithOneVerion = () => {
  return (
    <ThemeContext>
      <Center>
        <VersionDropdown versions={['0.1']} currentVersion="0.1" />
      </Center>
    </ThemeContext>
  );
};

export const VersionDropdownWithMultipleVerions = () => {
  const history = createBrowserHistory();
  const versions = ['0.3', '0.2', '0.1'];
  return (
    <ThemeContext>
      <Center>
        <Router history={history}>
          <VersionDropdown versions={versions} currentVersion={versions[0]} />
        </Router>
      </Center>
    </ThemeContext>
  );
};

VersionDropdownWithOneVerion.canvas = {
  height: 40,
};

VersionDropdownWithMultipleVerions.canvas = {
  display: 'flex',
  height: 200,
  width: 300,
  alignItems: 'flex-start',
  justifyContent: 'flex-end',
};
