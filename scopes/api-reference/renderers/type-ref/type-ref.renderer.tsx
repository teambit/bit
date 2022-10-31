import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaNodeSummary } from '@teambit/api-reference.renderers.schema-node-summary';

export const typeRefRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeRefSchema.name,
  Component: TypeRefComponent,
  nodeType: 'TypeRefs',
  default: true,
};

/**
 * @todo figure out how to render a type ref node
 */
function TypeRefComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
  } = props;

  const typeRefNode = api as TypeRefSchema;
  return (
    <SchemaNodeSummary
      name={typeRefNode.name}
      location={typeRefNode.location}
      doc={typeRefNode.doc}
      __schema={typeRefNode.__schema}
      signature={typeRefNode.signature || typeRefNode.toString()}
    />
  );
}
