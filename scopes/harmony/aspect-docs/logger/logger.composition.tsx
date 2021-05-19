import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Logger } from './index';

export const LoggerDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Logger />
    </MDXLayout>
  </ThemeContext>
);
