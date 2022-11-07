/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { InferenceTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { TypeInfoFromSchemaNode } from '@teambit/api-reference.utils.type-info-from-schema-node';

import styles from './inference-type.module.scss';

export const inferenceTypeRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === InferenceTypeSchema.name,
  Component: InferenceTypeComponent,
  nodeType: 'InferenceType',
  default: true,
};

function InferenceTypeComponent(props: APINodeRenderProps) {
  const {
    apiRefModel,
    apiNode: { api },
  } = props;

  return (
    <div className={styles.container}>
      <TypeInfoFromSchemaNode key={`type-ref-${api.__schema}`} node={api} apiRefModel={apiRefModel} />
    </div>
  );
}
