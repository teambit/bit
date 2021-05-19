import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Preview } from './index';

export const PreviewDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Preview />
    </MDXLayout>
  </ThemeContext>
);
