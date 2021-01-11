import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from './mdx-layout';
import MdxContentDefault from './mdx-layout.docs.md';

export const MDXLayoutExample = () => (
  <ThemeCompositions>
    <MDXLayout>
      <MdxContentDefault />
    </MDXLayout>
  </ThemeCompositions>
);
