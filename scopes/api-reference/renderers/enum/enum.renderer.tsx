import React from 'react';
import { EnumSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

export const enumRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === EnumSchema.name,
  Component: EnumComponent,
  nodeType: 'Enums',
  icon: { name: 'Enum', Component: EnumIcon },
  default: true,
  getName: (node) => {
    const enumNode = node as EnumSchema;
    return enumNode.name;
  },
};

function EnumComponent({ node }: APINodeRenderProps) {
  const enumNode = node as EnumSchema;
  return <>{enumNode.name}</>;
}

function EnumIcon() {
  return <></>;
}
