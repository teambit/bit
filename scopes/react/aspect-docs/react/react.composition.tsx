import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { ReactAspect } from './index';

export const ReactDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <ReactAspect />
    </MDXLayout>
  </ThemeCompositions>
);
