import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { MultiCompiler } from './index';

export const MultiCompilerDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <MultiCompiler />
    </MDXLayout>
  </ThemeContext>
);
