import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from './mdx-layout';
// @ts-ignore
import MdxContentDefault from './mdx-layout.docs.md';
// @ts-ignore
import MdxContentExample from './md-example.md';

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
  overflow: 'scroll',
  height: 200,
};
