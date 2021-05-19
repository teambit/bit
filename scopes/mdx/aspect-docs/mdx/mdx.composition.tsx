import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Mdx } from './index';

export const MdxDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Mdx />
    </MDXLayout>
  </ThemeContext>
);
