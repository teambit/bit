import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Typescript } from './index';

export const TypescriptDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Typescript />
    </MDXLayout>
  </ThemeContext>
);
