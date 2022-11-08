/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { InferenceTypeSchema } from '@teambit/semantics.entities.semantic-schema';

import styles from './inference-type.module.scss';

export const inferenceTypeRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === InferenceTypeSchema.name,
  Component: InferenceTypeComponent,
  nodeType: 'InferenceType',
  default: true,
};

function InferenceTypeComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
  } = props;

  const inferenceTypeNode = api as InferenceTypeSchema;

  return (
    <div key={`inference-${inferenceTypeNode.name}`} className={styles.node}>
      {inferenceTypeNode.type}
    </div>
  );
}
