import React from 'react';
import { docsFile } from '@teambit/documenter.types.docs-file';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { EvaIconFont } from '@teambit/evangelist.theme.icon-font';

import { Base } from './base';

export type DocsAppProps = {
  Provider: React.ComponentType;
  docs?: docsFile;
  componentId: string;
  compositions: [React.ComponentType];
};

export function DocsApp({ Provider, docs, componentId, compositions }: DocsAppProps) {
  return (
    <Provider>
      <ThemeContext>
        <EvaIconFont query="mxd7i0" />
        <Base docs={docs} componentId={componentId} compositions={compositions} />
      </ThemeContext>
    </Provider>
  );
}
