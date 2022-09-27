import React from 'react';
import { InterfaceSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

export const interfaceRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === InterfaceSchema.name,
  Component: InterfaceComponent,
  nodeType: 'Interfaces',
  icon: { name: 'Interface', Component: InterfaceIcon },
  default: true,
  getName: (node) => {
    const interfaceNode = node as InterfaceSchema;
    return interfaceNode.name;
  },
};

function InterfaceComponent({ node }: APINodeRenderProps) {
  const interfaceNode = node as InterfaceSchema;
  return <>{interfaceNode.name}</>;
}

function InterfaceIcon() {
  return <></>;
}
