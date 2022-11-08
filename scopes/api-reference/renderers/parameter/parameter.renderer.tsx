import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
// import { TypeInfoFromSchemaNode } from '@teambit/api-reference.utils.type-info-from-schema-node';
import { ParameterSchema } from '@teambit/semantics.entities.semantic-schema';
import { TableRow } from '@teambit/documenter.ui.table-row';

import styles from './parameter.renderer.module.scss';

export const parameterRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === ParameterSchema.name,
  Component: ParameterComponent,
  nodeType: 'Parameters',
  default: true,
};

function ParameterComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    renderers,
  } = props;

  const paramNode = api as ParameterSchema;
  const { name, isOptional, doc, type, defaultValue } = paramNode;
  const typeRenderer = renderers.find((renderer) => renderer.predicate(type));
  const customTypeRow = (typeRenderer && (
    <typeRenderer.Component
      {...props}
      apiNode={{ ...props.apiNode, api: type, renderer: typeRenderer }}
      depth={(props.depth ?? 0) + 1}
      metadata={{ [type.__schema]: { columnView: true } }}
    />
  )) || <div className={styles.node}>{type.toString()}</div>;

  return (
    <TableRow
      key={`${name}-param`}
      headings={['name', 'type', 'default', 'description']}
      colNumber={4}
      customRow={{
        type: customTypeRow,
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
