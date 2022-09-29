import React from 'react';
import { FunctionLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

export const functionRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === FunctionLikeSchema.name,
  Component: FunctionComponent,
  nodeType: 'Functions',
  icon: { name: 'Function', Component: FunctionIcon },
  default: true,
};

function FunctionComponent({ node }: APINodeRenderProps) {
  const functioNode = node as FunctionLikeSchema;
  return <>{functioNode.name}</>;
}

function FunctionIcon() {
  return <></>;
}
