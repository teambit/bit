import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Generator } from './index';

export const GeneratorDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <Generator />
    </MDXLayout>
  </ThemeCompositions>
);
