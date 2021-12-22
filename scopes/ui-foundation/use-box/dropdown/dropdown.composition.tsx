import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { Menu, Install, Import } from '@teambit/ui-foundation.ui.use-box.menu';
import { Menu as ScopeMenu } from '@teambit/ui-foundation.ui.use-box.scope-menu';
import { UseBoxDropdown } from './dropdown';

const methods = [
  {
    Title: <img style={{ width: '30px' }} src="http://static.bit.dev/brands/logo-npm-new.svg" />,
    Component: (
      <Install
        config={`npm config set @teambit:registry' https://node.bit.dev`}
        componentName="radio"
        packageManager="npm"
        copyString="npm i @teambit/design.ui.radio"
        registryName="@teambit"
      />
    ),
    order: 1,
  },
  {
    Title: <img style={{ width: '20px' }} src="https://static.bit.dev/brands/bit-logo-text.svg" />,
    Component: (
      <Import componentId="teambit.design/ui/radio" packageName="@teambit/design.ui.radio" componentName="radio" />
    ),
    order: 0,
  },
];

export const UseBoxExample = () => {
  return (
    <ThemeCompositions>
      <div style={{ width: 'fit-content', float: 'right' }}>
        <UseBoxDropdown position="bottom-end" Menu={<Menu methods={methods} componentName="radio" />}></UseBoxDropdown>
      </div>
    </ThemeCompositions>
  );
};

UseBoxExample.canvas = {
  height: '400px',
  width: '500px',
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'flex-start',
};

export const UseBoxScopeExample = () => {
  return (
    <ThemeCompositions>
      <div style={{ width: 'fit-content', float: 'right' }}>
        <UseBoxDropdown position="bottom-end" Menu={<ScopeMenu scopeName="@teambit.design" />}></UseBoxDropdown>
      </div>
    </ThemeCompositions>
  );
};

UseBoxScopeExample.canvas = {
  height: '400px',
  width: '500px',
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'flex-start',
};
