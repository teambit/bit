import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Node } from './index';

export const NodeDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <Node />
    </MDXLayout>
  </ThemeCompositions>
);
