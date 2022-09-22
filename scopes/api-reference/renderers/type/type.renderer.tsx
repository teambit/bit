import React from 'react';
import { TypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

export const typeRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeSchema.name,
  Component: TypeComponent,
  displayName: 'Types',
  icon: { name: 'Type', Component: TypeIcon },
  default: true,
};

function TypeComponent(node: APINodeRenderProps) {
  return <>{node.displayName}</>;
}

function TypeIcon() {
  return <></>;
}
