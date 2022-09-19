import React from 'react';
import { EnumSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

export const enumRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === EnumSchema.name,
  Component: EnumComponent,
  displayName: 'Enums',
  icon: { name: 'Enum', Component: EnumIcon },
};

function EnumComponent(node: APINodeRenderProps) {
  return <>{node.displayName}</>;
}

function EnumIcon() {
  return <></>;
}
