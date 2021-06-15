import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { Menu } from '@teambit/ui-foundation.ui.use-box.menu';
import { Menu as ScopeMenu } from '@teambit/ui-foundation.ui.use-box.scope-menu';
import { UseBoxDropdown } from './dropdown';

const styles = {
  width: '400px',
};

export const UseBoxExample = () => {
  return (
    <ThemeCompositions>
      <div style={styles}>
        <UseBoxDropdown
          position="bottom-end"
          defaultActiveOption="bit"
          Menu={() => (
            <Menu
              packageName="@teambit/design.ui.input.radio"
              componentId="teambit.design/ui/input/radio"
              registryName="@teambit"
              componentName="radio"
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
        <UseBoxDropdown position="bottom-end" Menu={() => <ScopeMenu scopeName="@teambit.design" />}></UseBoxDropdown>
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
