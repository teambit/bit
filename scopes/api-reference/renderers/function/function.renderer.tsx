import React from 'react';
import { FunctionLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

export const functionRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === FunctionLikeSchema.name,
  Component: FunctionComponent,
  nodeType: 'Functions',
  icon: { name: 'Function', Component: FunctionIcon },
  default: true,
  getName: (node) => {
    const classNode = node as FunctionLikeSchema;
    return classNode.name;
  },
};

function FunctionComponent(node: APINodeRenderProps) {
  return <>{node.displayName}</>;
}

function FunctionIcon() {
  return <></>;
}
