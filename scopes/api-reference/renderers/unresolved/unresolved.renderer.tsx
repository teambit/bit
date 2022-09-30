import React from 'react';
import { APINodeRenderer, APINodeRenderProps } from '@teambit/api-reference.models.api-node-renderer';

import { UnresolvedSchema } from '@teambit/semantics.entities.semantic-schema';

export const unresolvedRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === UnresolvedSchema.name,
  Component: UnresolvedComponent,
  nodeType: 'Unresolved',
  icon: { name: 'Unresolved', Component: UnresolvedIcon },
  default: true,
};

function UnresolvedComponent({ node, componentId }: APINodeRenderProps) {
  const unresolvedNode = node as UnresolvedSchema;
  return <></>;
}

function UnresolvedIcon() {
  return <></>;
}
