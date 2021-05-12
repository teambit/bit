import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/ui.mdx-layout';
import { Node } from './index';

export const NodeDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Node />
    </MDXLayout>
  </ThemeContext>
);
