import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Typescript } from './index';

export const TypescriptDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <Typescript />
    </MDXLayout>
  </ThemeCompositions>
);
