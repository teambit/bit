import React, { ReactNode, ComponentType } from 'react';
import { MDXProvider } from '@mdx-js/react';
import { H1, H2, H3, H4, H5, H6 } from '@teambit/documenter.ui.heading';

const defaultComponentReferences = {
  h1: H1,
  h2: H2,
  h3: H3,
  h4: H4,
  h5: H5,
  h6: H6,
};

export type ComponentReference = {
  [tag: string]: ComponentType;
};

export type MDXLayoutProps = {
  children: ReactNode;
  componentReferences: ComponentReference;
};

/**
 * MDX Provider which includes documenter as design system for markdown rendering.
 */
export function MDXLayout({ children, componentReferences }: MDXLayoutProps) {
  const components = Object.assign(defaultComponentReferences, componentReferences);
  return <MDXProvider components={components}>{children}</MDXProvider>;
}

MDXLayout.defaultProps = {
  componentReferences: [],
};
