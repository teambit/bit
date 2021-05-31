import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { DependencyResolver } from './index';

export const DependencyResolverDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <DependencyResolver />
    </MDXLayout>
  </ThemeCompositions>
);
