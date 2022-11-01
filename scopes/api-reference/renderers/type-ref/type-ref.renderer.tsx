import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaNodeSummary } from '@teambit/api-reference.renderers.schema-node-summary';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { copySchemaNode } from '@teambit/api-reference.utils.copy-schema-node';

export const typeRefRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeRefSchema.name,
  Component: TypeRefComponent,
  nodeType: 'TypeRefs',
  default: true,
};

/**
 * @todo figure out how to render deeply nested typeArgs
 */
function TypeRefComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    apiRefModel,
  } = props;

  const typeRefNode = api as TypeRefSchema;

  const isTopLevelExport = apiRefModel.apiByName.get(typeRefNode.name);

  if (isTopLevelExport) {
    return (
      <APINodeDetails
        {...props}
        apiNode={{
          ...props.apiNode,
          api: copySchemaNode(typeRefNode, { signature: typeRefNode.signature || typeRefNode.toString() }),
        }}
      />
    );
  }

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
