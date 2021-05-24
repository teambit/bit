import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Pnpm } from './index';

export const PnpmDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Pnpm />
    </MDXLayout>
  </ThemeContext>
);
