import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { ParameterSchema } from '@teambit/semantics.entities.semantic-schema';

export const parameterRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === ParameterSchema.name,
  Component: ParameterComponent,
  nodeType: 'Parameters',
  default: true,
};

/**
 * @todo - implement parameter
 */
function ParameterComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    // renderers,
  } = props;
  const typeNode = api as ParameterSchema;

  return <APINodeDetails {...props} apiNode={{ ...props.apiNode, api: typeNode.type }} />;
}
