import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { extractTypeFromSchemaNode } from '@teambit/api-reference.utils.extract-type-from-schema-node';
import { ParameterSchema } from '@teambit/semantics.entities.semantic-schema';
import { TableRow } from '@teambit/documenter.ui.table-row';

export const parameterRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === ParameterSchema.name,
  Component: ParameterComponent,
  nodeType: 'Parameters',
  default: true,
};

function ParameterComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
  } = props;
  const paramNode = api as ParameterSchema;
  const { name, isOptional, doc, type, defaultValue } = paramNode;

  return (
    <TableRow
      key={`${name}-param`}
      headings={['name', 'type', 'default', 'description']}
      colNumber={4}
      row={{
        name,
        description: doc?.comment || '',
        required: !isOptional,
        type: extractTypeFromSchemaNode(type),
        default: { value: defaultValue },
      }}
    />
  );
}
