import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from './mdx-layout';
import MdxContentDefault from './mdx-layout.docs.mdx';
import MdxContentExample from './mdx-example.mdx';

export const MDXLayoutExample = () => (
  <ThemeCompositions>
    <MDXLayout>
      <MdxContentDefault />
    </MDXLayout>
  </ThemeCompositions>
);

export const MDXLayoutSecondExample = () => (
  <ThemeCompositions>
    <MDXLayout>
      <MdxContentExample />
    </MDXLayout>
  </ThemeCompositions>
);

MDXLayoutSecondExample.canvas = {
  height: 200,
};
