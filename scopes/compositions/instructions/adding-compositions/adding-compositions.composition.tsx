import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/ui.mdx-layout';
import { AddingCompositions } from './index';

export const ThemedAddingCompositions = () => (
  <ThemeContext>
    <MDXLayout>
      <AddingCompositions />
    </MDXLayout>
  </ThemeContext>
);
