import React from 'react';
import { APINodeRenderProps, APINodeRenderer, nodeStyles } from '@teambit/api-reference.models.api-node-renderer';
import { InferenceTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import classNames from 'classnames';

export const inferenceTypeRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === InferenceTypeSchema.name,
  Component: InferenceTypeComponent,
  nodeType: 'InferenceType',
  default: true,
};

function InferenceTypeComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    className,
  } = props;

  const inferenceTypeNode = api as InferenceTypeSchema;

  // if(!inferenceTypeNode.type || !inferenceTypeNode.name) return null;

  return (
    <div key={`inference-${inferenceTypeNode.name}`} className={classNames(nodeStyles.node, className)}>
      {inferenceTypeNode.type || inferenceTypeNode.name}
    </div>
  );
}
