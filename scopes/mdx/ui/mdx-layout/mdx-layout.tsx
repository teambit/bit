import React, { useMemo } from 'react';
import { MDXLayout as MDXLayoutBase, MDXProviderComponents, MDXLayoutProps } from '@teambit/documenter.markdown.mdx';
import { Snippet } from '@teambit/mdx.ui.docs.snippet';
import { Link } from '@teambit/mdx.ui.docs.link';
import './mdx-layout.css';

export type { MDXProviderComponents, MDXLayoutProps } from '@teambit/documenter.markdown.mdx';

const mdxComponents: MDXProviderComponents = {
  code: Snippet,
  a: Link,
};

/**
 * MDX Provider which includes documenter as design system for markdown rendering.
 */
export function MDXLayout({ components, ...rest }: MDXLayoutProps) {
  const _components: MDXProviderComponents = useMemo(
    () => ({ ...mdxComponents, ...components }),
    [mdxComponents, components]
  );

  return <MDXLayoutBase components={_components} {...rest} />;
}
