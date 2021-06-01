import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Component } from './index';

export const ComponentDocs = () => (
  <ThemeCompositions>
    <MDXLayout>
      <Component />
    </MDXLayout>
  </ThemeCompositions>
);
