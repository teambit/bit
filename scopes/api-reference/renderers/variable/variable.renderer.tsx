import React from 'react';
import { VariableLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';

export const variableRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === VariableLikeSchema.name,
  Component: VariableComponent,
  nodeType: 'Variables',
  icon: { name: 'Variable', url: 'https://static.bit.dev/api-reference/variable.svg' },
  default: true,
};

function VariableComponent(props: APINodeRenderProps) {
  return <APINodeDetails {...props} />;
}
