import React from 'react';
import { FunctionLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

export const functionRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === FunctionLikeSchema.name,
  Component: FunctionComponent,
  displayName: 'Functions',
  icon: { name: 'Function', Component: FunctionIcon },
};

function FunctionComponent(node: APINodeRenderProps) {
  return <>{node.displayName}</>;
}

function FunctionIcon() {
  return <></>;
}
