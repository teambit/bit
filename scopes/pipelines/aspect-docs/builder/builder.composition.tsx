import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Builder } from './index';

export const BuilderDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Builder />
    </MDXLayout>
  </ThemeContext>
);
