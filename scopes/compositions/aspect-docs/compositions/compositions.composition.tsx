import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Compositions } from './index';

export const CompositionsDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <Compositions />
    </MDXLayout>
  </ThemeCompositions>
);
