import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Builder } from './index';

export const BuilderDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <Builder />
    </MDXLayout>
  </ThemeCompositions>
);
