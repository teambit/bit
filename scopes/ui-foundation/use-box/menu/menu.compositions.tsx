import React from 'react';
import { Menu } from './menu';
import { Install } from './install';
import { Import } from './import';

const methods = [
  {
    Title: <img style={{ width: '30px' }} src="https://static.bit.dev/brands/logo-npm-new.svg" />,
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

export const MenuExample = () => {
  return <Menu style={{ width: 400 }} methods={methods} componentName="radio" />;
};
