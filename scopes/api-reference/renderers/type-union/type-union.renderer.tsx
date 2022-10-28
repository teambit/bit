import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { TypeUnionSchema } from '@teambit/semantics.entities.semantic-schema';

export const typeUnionRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeUnionSchema.name,
  Component: TypeUnionComponent,
  nodeType: 'TypeUnion',
  default: true,
};

function TypeUnionComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    renderers,
  } = props;
  const typeNode = api as TypeUnionSchema;
  console.log('🚀 ~ file: type-union.renderer.tsx ~ line 19 ~ TypeUnionComponent ~ typeNode', typeNode);

  return <APINodeDetails {...props} />;
}
