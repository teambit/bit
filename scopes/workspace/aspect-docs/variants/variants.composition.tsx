import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';

import { Variants } from './index';

export const VariantsDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <Variants />
    </MDXLayout>
  </ThemeCompositions>
);
