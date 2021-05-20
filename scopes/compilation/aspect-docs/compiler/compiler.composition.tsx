import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Compiler } from './index';

export const CompilerDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Compiler />
    </MDXLayout>
  </ThemeContext>
);
