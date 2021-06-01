import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { ReactNative } from './index';

export const ReactNativeDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <ReactNative />
    </MDXLayout>
  </ThemeCompositions>
);
