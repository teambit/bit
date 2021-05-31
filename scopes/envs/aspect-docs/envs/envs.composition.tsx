import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Envs } from './index';

export const EnvsDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <Envs />
    </MDXLayout>
  </ThemeCompositions>
);
