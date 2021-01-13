import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { DependencyTree } from './dependency-tree';
import { exampleData } from './dependency-tree-example.data';

export const DrawerExample = () => {
  return (
    <ThemeCompositions>
      <DependencyTree dependenciesArray={exampleData} />
    </ThemeCompositions>
  );
};

DrawerExample.canvas = {
  height: 400,
};
