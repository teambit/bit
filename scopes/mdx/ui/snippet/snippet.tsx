import React, { useContext } from 'react';
import { MDXScopeContext } from '@teambit/mdx.ui.mdx-scope-context';
import { mdx } from '@mdx-js/react';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { Playground } from '@teambit/documenter.code.react-playground';
import styles from './snippet.module.scss';

export type SnippetProps = {
  children: string;
  live?: boolean | string;
};

export function Snippet({ children, live }: SnippetProps) {
  const components = useContext(MDXScopeContext);
  const scope = Object.assign({}, components, {
    mdx,
  });
  return (
    <div className={styles.snippet}>
      {live ? <Playground code={children} scope={scope} /> : <CodeSnippet>{children}</CodeSnippet>}
    </div>
  );
}
