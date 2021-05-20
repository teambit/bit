import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Pkg } from './index';

export const PkgDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Pkg />
    </MDXLayout>
  </ThemeContext>
);
