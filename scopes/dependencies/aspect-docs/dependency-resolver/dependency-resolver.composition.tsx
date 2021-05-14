import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/ui.mdx-layout';
import { DependencyResolver } from './index';

export const DependencyResolverDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <DependencyResolver />
    </MDXLayout>
  </ThemeContext>
);
