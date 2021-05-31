import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Pnpm } from './index';

export const PnpmDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <Pnpm />
    </MDXLayout>
  </ThemeCompositions>
);
