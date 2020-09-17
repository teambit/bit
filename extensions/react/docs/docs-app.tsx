import { docsFile } from '@teambit/documenter.types.docs-file';
import React from 'react';

import { Base } from './base';

export type DocsAppProps = {
  onclick: any;
  Provider: React.ComponentType;
  docs: docsFile;
  componentId: string;
  compositions: [React.ComponentType];
};

export function DocsApp({ onclick, Provider, docs, componentId, compositions }: DocsAppProps) {
  return (
    <Provider>
      <Base onClick={onclick} docs={docs} componentId={componentId} compositions={compositions} />
    </Provider>
  );
}
