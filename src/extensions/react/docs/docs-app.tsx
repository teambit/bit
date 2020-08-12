import React from 'react';
import { Base } from './base';

export type DocsAppProps = {
  Provider: React.ComponentType;
  docs: any; // TODO: @uri create a type for docs asap
  componentId: string;
  compositions: [React.ComponentType];
};

export function DocsApp({ Provider, docs, componentId, compositions }: DocsAppProps) {
  return (
    <Provider>
      <Base docs={docs} componentId={componentId} compositions={compositions} />
    </Provider>
  );
}
