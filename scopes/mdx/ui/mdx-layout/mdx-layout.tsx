import React, { ReactNode, createContext, useContext } from 'react';
import { MDXProvider, mdx } from '@mdx-js/react';
// import { ComponentID } from '@teambit/component-id';
// import { ComponentContext } from '@teambit/component';
import type { Sizes } from '@teambit/documenter.ui.heading';
// import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Paragraph } from '@teambit/documenter.ui.paragraph';
// import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';
// import { ExternalLink } from '@teambit/documenter.routing.external-link';

import { Separator } from '@teambit/documenter.ui.separator';
// import { Image } from '@teambit/evangelist.elements.image';
// import { List } from '@teambit/documenter.ui.list';
// import { Playground } from '@teambit/documenter.code.react-playground';

import { Bold } from '../../../../../react-new-project/components/bold';
import { Italic } from '../../../../../react-new-project/components/italic';
import { Sup } from '../../../../../react-new-project/components/sup';
import { Table } from '../../../../../react-new-project/components/base-table';
// import { Pre } from '../../../../../react-new-project/components/pre';
import { Tr } from '../../../../../react-new-project/components/tr';
import { Td } from '../../../../../react-new-project/components/td';
import { Ul } from '../../../../../react-new-project/components/ul';
import { Ol } from '../../../../../react-new-project/components/ol';
import { Image } from '../../../../../react-new-project/components/image';
import { LinkedHeading } from '../../../../../react-new-project/components/linked-heading';
import { BlockQuote } from '../../../../../react-new-project/components/block-quote';
import { ExternalLink } from '../../../../../react-new-project/components/external-link';
import { CodeSnippet } from '../../../../../react-new-project/components/code-snippet';
import { Playground } from '../../../../../react-new-project/components/code/react-playground';

import styles from './mdx.module.scss';

function createHeading(size: Sizes) {
  return function Heading({ children }: { children: ReactNode }) {
    // const component = useContext(ComponentContext);
    // console.log("component", component)
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

function Snippet({ children, live }: { live: string; children: string }) {
  if (live) {
    return <Playground code={children} scope={{ mdx }} />;
  }
  return <CodeSnippet>{children}</CodeSnippet>;
}

function Link(props) {
  return <ExternalLink {...props} className={styles.link} />;
}

function P({ children }) {
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
