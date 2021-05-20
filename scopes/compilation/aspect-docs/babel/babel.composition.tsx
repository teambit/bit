import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Babel } from './index';

export const BabelDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Babel />
    </MDXLayout>
  </ThemeContext>
);
