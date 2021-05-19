import React, { ReactNode } from 'react';
import { MDXProvider } from '@mdx-js/react';
import { Separator } from '@teambit/documenter.ui.separator';
import { Bold } from '@teambit/documenter.ui.bold';
import { Italic } from '@teambit/documenter.ui.italic';
import { Sup } from '@teambit/documenter.ui.sup';
import { Table } from '@teambit/documenter.ui.table.base-table';
import { Tr } from '@teambit/documenter.ui.table.tr';
import { Td } from '@teambit/documenter.ui.table.td';
import { Ul } from '@teambit/documenter.ui.ul';
import { Ol } from '@teambit/documenter.ui.ol';
import { Image } from '@teambit/documenter.ui.image';
import { BlockQuote } from '@teambit/documenter.ui.block-quote';
import { createHeading } from '@teambit/mdx.ui.docs.create-heading';
import { HighlightedTextSpan } from '@teambit/mdx.ui.docs.highlighted-text-span';
import { Snippet } from '@teambit/mdx.ui.docs.snippet';
import { Link } from '@teambit/mdx.ui.docs.link';
import { P } from '@teambit/mdx.ui.docs.paragraph';

const defaultMdxComponents = {
  h1: createHeading('lg'),
  h2: createHeading('md'),
  h3: createHeading('sm'),
  h4: createHeading('xs'),
  h5: createHeading('xxs'),
  h6: createHeading('xxs'),
  p: P,
  code: Snippet,
  a: Link,
  inlineCode: HighlightedTextSpan,
  ol: Ol,
  ul: Ul,
  hr: Separator,
  thematicBreak: Separator,
  img: Image,
  strong: Bold,
  em: Italic,
  // pre: Snippet, // TODO - find a way to add this. it collides with code tag and overrides the pre tag in the code snippet component.
  sup: Sup,
  table: Table,
  tr: Tr,
  td: Td,
  blockquote: BlockQuote,
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
  mdxComponents: [],
};
