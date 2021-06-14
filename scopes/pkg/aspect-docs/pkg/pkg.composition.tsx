import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Pkg } from './index';

export const PkgDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <Pkg />
    </MDXLayout>
  </ThemeCompositions>
);
