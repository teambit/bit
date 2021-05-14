import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/ui.mdx-layout';
import { Envs } from './index';

export const EnvsDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Envs />
    </MDXLayout>
  </ThemeContext>
);
