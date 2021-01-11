import React, { useContext } from 'react';
import { MDXScopeContext } from '@teambit/ui.mdx-scope-context';
import { mdx } from '@mdx-js/react';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { Playground } from '@teambit/documenter.code.react-playground';

export type SnippetProps = {
  children: string;
  live?: boolean | string;
};

export function Snippet({ children, live }: SnippetProps) {
  const components = useContext(MDXScopeContext);
  const scope = Object.assign({}, components, {
    mdx,
  });

  if (live) {
    return <Playground code={children} scope={scope} />;
  }
  return <CodeSnippet>{children}</CodeSnippet>;
}
