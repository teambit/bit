import React from 'react';
import { Menu } from './menu';

export const MenuExample = () => {
  return (
    <div style={{ width: 400 }}>
      <Menu
        packageName="@teambit/design.ui.input.radio"
        componentId="teambit.design/ui/input/radio"
        registryName="@teambit"
        componentName="radio"
      />
    </div>
  );
};
