import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Preview } from './index';

export const PreviewDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <Preview />
    </MDXLayout>
  </ThemeCompositions>
);
