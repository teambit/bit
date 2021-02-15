import React from 'react';
import { docsFile } from '@teambit/documenter.types.docs-file';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { EvaIconFont } from '@teambit/evangelist.theme.icon-font';
import { RenderingContext } from '@teambit/preview';
import { Base } from './base';

export type DocsAppProps = {
  Provider: React.ComponentType;
  docs?: docsFile;
  componentId: string;
  compositions: [React.ComponentType];
  renderingContext: RenderingContext;
};

export function DocsApp({ Provider, docs, componentId, compositions, renderingContext }: DocsAppProps) {
  return (
    <Provider>
      <ThemeContext>
        <EvaIconFont query="mxd7i0" />
        <Base docs={docs} componentId={componentId} compositions={compositions} renderingContext={renderingContext} />
      </ThemeContext>
    </Provider>
  );
}
