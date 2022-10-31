import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { InferenceTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaNodeSummary } from '@teambit/api-reference.renderers.schema-node-summary';

export const inferenceTypeRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === InferenceTypeSchema.name,
  Component: InferenceTypeComponent,
  nodeType: 'InferenceType',
  default: true,
};

/**
 * @todo - implement parameter
 */
function InferenceTypeComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
  } = props;
  const inferenceType = api as InferenceTypeSchema;
  return (
    <SchemaNodeSummary
      key={`inference-type-${inferenceType.type}`}
      name={inferenceType.name}
      location={inferenceType.location}
      doc={inferenceType.doc}
      __schema={inferenceType.__schema}
      signature={inferenceType.signature || inferenceType.toString()}
    />
  );
}
