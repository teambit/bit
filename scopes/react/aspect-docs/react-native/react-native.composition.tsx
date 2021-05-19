import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { ReactNative } from './index';

export const ReactNativeDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <ReactNative />
    </MDXLayout>
  </ThemeContext>
);
