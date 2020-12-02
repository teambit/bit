import React, { ReactNode } from 'react';
import { MDXProvider } from '@mdx-js/react';
import type { Sizes } from '@teambit/documenter.ui.heading';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Paragraph } from '@teambit/documenter.ui.paragraph';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { ExternalLink } from '@teambit/documenter.routing.external-link';
// import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';

function createHeading(size: Sizes) {
  return function Heading({ children }: { children: ReactNode }) {
    return (
      <LinkedHeading size={size} link="">
        {children}
      </LinkedHeading>
    );
  };
}

const defaultMdxComponents = {
  h1: createHeading('lg'),
  h2: createHeading('lg'),
  h3: createHeading('md'),
  h4: createHeading('sm'),
  h5: createHeading('xs'),
  h6: createHeading('xxs'),
  p: Paragraph,
  code: CodeSnippet,
  a: ExternalLink,
  // inlineCode: HighlightedText
};

type ComponentType =
  | 'a'
  | 'blockquote'
  | 'code'
  | 'del'
  | 'em'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'hr'
  | 'img'
  | 'inlineCode'
  | 'li'
  | 'ol'
  | 'p'
  | 'pre'
  | 'strong'
  | 'sup'
  | 'table'
  | 'td'
  | 'thematicBreak'
  | 'tr'
  | 'ul';

export type MDXComponents = {
  [key in ComponentType]?: React.ComponentType<any>;
};

export type MDXLayoutProps = {
  children: ReactNode;
  mdxComponents: MDXComponents;
};

/**
 * MDX Provider which includes documenter as design system for markdown rendering.
 */
export function MDXLayout({ children, mdxComponents }: MDXLayoutProps) {
  const components = Object.assign(defaultMdxComponents, mdxComponents);
  return <MDXProvider components={components}>{children}</MDXProvider>;
}

MDXLayout.defaultProps = {
  componentReferences: [],
};
