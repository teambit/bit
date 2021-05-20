import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { ReactAspect } from './index';

export const ReactDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <ReactAspect />
    </MDXLayout>
  </ThemeContext>
);
