import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';

export const typeRefRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeRefSchema.name,
  Component: TypeRefComponent,
  nodeType: 'TypeRefs',
  default: true,
};

function TypeRefComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
  } = props;
  const typeRefNode = api as TypeRefSchema;
  console.log('🚀 ~ file: type-ref.renderer.tsx ~ line 18 ~ TypeRefComponent ~ typeRefNode', typeRefNode);
  return <APINodeDetails {...props} />;
}
