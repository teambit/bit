import React from 'react';
import { VariableLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

export const variableRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === VariableLikeSchema.name,
  Component: VariableComponent,
  displayName: 'Types',
  icon: { name: 'Type', Component: VariableIcon },
};

function VariableComponent(node: APINodeRenderProps) {
  return <>{node.displayName}</>;
}

function VariableIcon() {
  return <></>;
}
