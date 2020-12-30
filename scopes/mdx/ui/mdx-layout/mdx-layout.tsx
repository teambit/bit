import React, { ReactNode, useContext } from 'react';
import { MDXScopeContext } from '@teambit/ui.mdx-scope-context';
import { MDXProvider, mdx } from '@mdx-js/react';
import type { Sizes } from '@teambit/documenter.ui.heading';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Paragraph } from '@teambit/documenter.ui.paragraph';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';
import { ExternalLink, ExternalLinkProps } from '@teambit/documenter.routing.external-link';
import { Separator } from '@teambit/documenter.ui.separator';
import { Playground } from '@teambit/documenter.code.react-playground';
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

import styles from './mdx.module.scss';

function createHeading(size: Sizes) {
  return function Heading({ children }: { children: ReactNode }) {
    return (
      <LinkedHeading className={styles.mdxLinkedHeading} size={size} link="">
        {children}
      </LinkedHeading>
    );
  };
}

function HighlightedTextSpan({ children }: { children: ReactNode }) {
  return (
    <HighlightedText element="span" size="xxs">
      {children}
    </HighlightedText>
  );
}

// TODO: @oded please refactor to an individual component.
function Snippet({ children, live }: { live: string; children: string }) {
  const components = useContext(MDXScopeContext);
  console.log(components);
  const scope = Object.assign({}, components, {
    mdx,
  });

  if (live) {
    return <Playground code={children} scope={scope} />;
  }
  return <CodeSnippet>{children}</CodeSnippet>;
}

function Link(props: ExternalLinkProps) {
  return <ExternalLink {...props} className={styles.link} />;
}

function P({ children }: { children: ReactNode }) {
  return (
    <Paragraph size="xs" className={styles.mdxParagraph}>
      {children}
    </Paragraph>
  );
}

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
