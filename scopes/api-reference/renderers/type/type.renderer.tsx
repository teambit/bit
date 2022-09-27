import React from 'react';
import { TypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

export const typeRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeSchema.name,
  Component: TypeComponent,
  nodeType: 'Types',
  icon: { name: 'Type', Component: TypeIcon },
  default: true,
  getName: (node) => {
    const typeNode = node as TypeSchema;
    return typeNode.name;
  },
};

function TypeComponent({ node }: APINodeRenderProps) {
  const typeNode = node as TypeSchema;

  return <>{typeNode.name}</>;
}

function TypeIcon() {
  return <></>;
}
