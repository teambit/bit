/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { InferenceTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { useUpdatedUrlFromQuery } from '@teambit/api-reference.hooks.use-api-ref-url';

export const inferenceTypeRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === InferenceTypeSchema.name,
  Component: InferenceTypeComponent,
  nodeType: 'InferenceType',
  default: true,
};

function InferenceTypeComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    renderers,
    apiRefModel,
    depth,
    ...rest
  } = props;

  const inferenceType = api as InferenceTypeSchema;
  const exportedType = apiRefModel.apiByName.get(inferenceType.type);
  const exportedTypeUrl =
    exportedType &&
    useUpdatedUrlFromQuery({ selectedAPI: `${exportedType.renderer.nodeType}/${exportedType.api.name}` });

  if (exportedTypeUrl) {
    return (
      <a className={rest.className} href={exportedTypeUrl}>
        {exportedType.api.name}
      </a>
    );
  }

  return <div {...rest}>{inferenceType.type}</div>;
}
