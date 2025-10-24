import React from 'react';
import type { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { ThisTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { TypeRefName } from '@teambit/api-reference.renderers.type-ref';
import { useUpdatedUrlFromQuery } from '@teambit/api-reference.hooks.use-api-ref-url';

export const thisRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === ThisTypeSchema.name,
  Component: ThisComponent,
  nodeType: 'This',
  default: true,
};

function ThisComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    apiRefModel,
  } = props;

  const thisType = api as ThisTypeSchema;
  const typeRef = thisType.name !== 'this' ? apiRefModel.apiByName.get(thisType.name) : undefined;

  if (!typeRef) return <>{api.name}</>;

  return (
    <TypeRefName name={typeRef.api.name as string} url={useUpdatedUrlFromQuery({ selectedAPI: typeRef.api.name })} />
  );
}
