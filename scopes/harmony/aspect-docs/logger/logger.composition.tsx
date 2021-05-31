import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Logger } from './index';

export const LoggerDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <Logger />
    </MDXLayout>
  </ThemeCompositions>
);
