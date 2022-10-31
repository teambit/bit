import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { ParameterSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaNodeSummary } from '@teambit/api-reference.renderers.schema-node-summary';
import { copySchemaNode } from '@teambit/api-reference.utils.copy-schema-node';

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
  const typeNode = api as ParameterSchema;

  const typeRenderer = renderers.find((renderer) => renderer.predicate(typeNode.type));

  if (typeRenderer) {
    const apiNode = {
      ...props.apiNode,
      renderer: typeRenderer,
      api: copySchemaNode(typeNode.type, { name: typeNode.name, signature: typeNode.toString() }),
    };

    return <typeRenderer.Component {...props} apiNode={apiNode} />;
  }

  return (
    <SchemaNodeSummary
      key={`${typeNode.name}-param`}
      name={typeNode.name}
      location={typeNode.location}
      doc={typeNode.doc}
      __schema={typeNode.__schema}
      signature={typeNode.toString()}
    />
  );
}
