import React from 'react';
import { VariableLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

export const variableRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === VariableLikeSchema.name,
  Component: VariableComponent,
  nodeType: 'Types',
  icon: { name: 'Type', Component: VariableIcon },
  default: true,
  getName: (node) => {
    const classNode = node as VariableLikeSchema;
    return classNode.name;
  },
};

function VariableComponent(node: APINodeRenderProps) {
  return <>{node.displayName}</>;
}

function VariableIcon() {
  return <></>;
}
