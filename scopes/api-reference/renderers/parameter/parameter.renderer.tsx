import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { TypeInfoFromSchemaNode } from '@teambit/api-reference.utils.type-info-from-schema-node';
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
    apiRefModel,
  } = props;
  const paramNode = api as ParameterSchema;
  const { name, isOptional, doc, type, defaultValue } = paramNode;

  return (
    <TableRow
      key={`${name}-param`}
      headings={['name', 'type', 'default', 'description']}
      colNumber={4}
      customRow={{
        type: (
          <TypeInfoFromSchemaNode
            key={`typeinfo-${api.__schema}-${api.toString()}`}
            node={type}
            apiRefModel={apiRefModel}
          />
        ),
      }}
      row={{
        name,
        description: doc?.comment || '',
        required: !isOptional,
        type: '',
        default: { value: defaultValue },
      }}
    />
  );
}
