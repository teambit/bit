import React from 'react';
import { APINodeRenderer, APINodeRenderProps } from '@teambit/api-reference.models.api-node-renderer';
import { UnresolvedSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';

export const unresolvedRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === UnresolvedSchema.name,
  Component: UnresolvedComponent,
  nodeType: 'Unresolved',
  icon: { name: 'Unresolved', url: '' },
  default: true,
};

function UnresolvedComponent(props: APINodeRenderProps) {
  return <APINodeDetails {...props} />;
}
