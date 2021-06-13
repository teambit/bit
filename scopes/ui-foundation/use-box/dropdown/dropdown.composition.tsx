import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { UseBoxDropdown } from './dropdown';
import { Menu } from '../menu';
import { Menu as ScopeMenu } from '../scope-menu';

const styles = {
  width: '400px',
};

export const UseBoxExample = () => {
  return (
    <ThemeCompositions>
      <div style={styles}>
        <UseBoxDropdown
          defaultActiveOption="bit"
          Menu={() => (
            <Menu
              packageLink="@teambit/design.ui.input.radio"
              bitLink="teambit.design/ui/input/radio"
              registryName="@teambit"
              componentName="radio"
              key="bla"
            />
          )}
        ></UseBoxDropdown>
      </div>
    </ThemeCompositions>
  );
};

UseBoxExample.canvas = {
  height: '400px',
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'flex-start',
};

export const UseBoxScopeExample = () => {
  return (
    <ThemeCompositions>
      <div style={styles}>
        <UseBoxDropdown Menu={() => <ScopeMenu scopeName="@teambit.design" />}></UseBoxDropdown>
      </div>
    </ThemeCompositions>
  );
};

UseBoxScopeExample.canvas = {
  height: '400px',
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'flex-start',
};
