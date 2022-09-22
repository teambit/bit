import React from 'react';
import { InterfaceSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

export const interfaceRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === InterfaceSchema.name,
  Component: InterfaceComponent,
  displayName: 'Interfaces',
  icon: { name: 'Interface', Component: InterfaceIcon },
  default: true,
};

function InterfaceComponent(node: APINodeRenderProps) {
  return <>{node.displayName}</>;
}

function InterfaceIcon() {
  return <></>;
}
