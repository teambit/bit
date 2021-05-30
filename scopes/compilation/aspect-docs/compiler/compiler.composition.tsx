import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Compiler } from './index';

export const CompilerDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <Compiler />
    </MDXLayout>
  </ThemeCompositions>
);
