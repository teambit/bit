import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { ComponentTree } from './component-tree';

export const EmptyComponentTree = () => (
  <ThemeCompositions>
    <ComponentTree components={[]} />
  </ThemeCompositions>
);
