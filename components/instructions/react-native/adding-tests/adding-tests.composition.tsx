import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { AddingTests } from './index';

export const ThemedAddingTests = () => (
  <ThemeContext>
    <MDXLayout>
      <AddingTests />
    </MDXLayout>
  </ThemeContext>
);
