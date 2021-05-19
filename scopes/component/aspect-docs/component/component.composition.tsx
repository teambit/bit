import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Component } from './index';

export const ComponentDocs = () => (
  <ThemeContext>
    <MDXLayout>
      <Component />
    </MDXLayout>
  </ThemeContext>
);
