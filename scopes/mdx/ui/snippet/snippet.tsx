import React, { useContext, useMemo } from 'react';
import { MDXScopeContext } from '@teambit/mdx.ui.mdx-scope-context';
import { mdx } from '@mdx-js/react';
import { Snippet as BaseSnippet, SnippetProps } from '@teambit/documenter.markdown.hybrid-live-code-snippet';

export function Snippet({ scope, ...rest }: SnippetProps) {
  const components = useContext(MDXScopeContext);
  const _scope = useMemo(() => ({ ...components, mdx, ...scope }), [components, scope, mdx]);

  return <BaseSnippet scope={_scope} {...rest} />;
}
