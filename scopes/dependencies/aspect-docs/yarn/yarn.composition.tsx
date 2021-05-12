import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/ui.mdx-layout';
import { Yarn } from './index';

export const YarnDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Yarn />
    </MDXLayout>
  </ThemeContext>
);
