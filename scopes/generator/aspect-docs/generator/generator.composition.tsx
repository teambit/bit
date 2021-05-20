import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Generator } from './index';

export const GeneratorDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Generator />
    </MDXLayout>
  </ThemeContext>
);
