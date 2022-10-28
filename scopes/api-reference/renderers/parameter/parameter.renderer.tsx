import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { ParameterSchema } from '@teambit/semantics.entities.semantic-schema';

export const parameterRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === ParameterSchema.name,
  Component: ParameterComponent,
  nodeType: 'Parameters',
  default: true,
};

function ParameterComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    renderers,
  } = props;
  const typeNode = api as ParameterSchema;
  console.log('🚀 ~ file: parameter.renderer.tsx ~ line 19 ~ ParameterComponent ~ typeNode', typeNode);

  return <APINodeDetails {...props} />;
}
