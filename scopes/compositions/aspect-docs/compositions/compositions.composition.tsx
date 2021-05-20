import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Compositions } from './index';

export const CompositionsDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Compositions />
    </MDXLayout>
  </ThemeContext>
);
