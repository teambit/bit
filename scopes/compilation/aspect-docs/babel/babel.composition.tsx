import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Babel } from './index';

export const BabelDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <Babel />
    </MDXLayout>
  </ThemeCompositions>
);
