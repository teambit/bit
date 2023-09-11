import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { ExportingComponents } from './index';

export const ThemedExportingComponents = () => (
  <ThemeContext>
    <MDXLayout>
      <ExportingComponents />
    </MDXLayout>
  </ThemeContext>
);
