import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/ui.mdx-layout';
import { AddingDocs } from './index';

export const ThemedAddingDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <AddingDocs />
    </MDXLayout>
  </ThemeContext>
);
