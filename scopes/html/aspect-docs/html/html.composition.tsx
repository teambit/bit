import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Html } from './index';

export const HtmlDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <Html />
    </MDXLayout>
  </ThemeCompositions>
);
