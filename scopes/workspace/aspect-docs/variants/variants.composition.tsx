import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';

import { Variants } from './index';

export const VariantsDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Variants />
    </MDXLayout>
  </ThemeContext>
);
