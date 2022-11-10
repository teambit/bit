import React from 'react';
import { InterfaceSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { GroupedSchemaNodesSummary } from '@teambit/api-reference.renderers.grouped-schema-nodes-summary';

export const interfaceRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === InterfaceSchema.name,
  Component: InterfaceComponent,
  nodeType: 'Interfaces',
  icon: { name: 'Interface', url: 'https://static.bit.dev/api-reference/interface.svg' },
  default: true,
};

function InterfaceComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
  } = props;
  const interfaceNode = api as InterfaceSchema;
  const { extendsNodes, signature, members } = interfaceNode;
  const extendsSignature = extendsNodes?.[0]?.name;
  const displaySignature = `${signature}${(extendsSignature && ' '.concat(extendsSignature)) || ''}`;

  return (
    <APINodeDetails {...props} displaySignature={displaySignature}>
      <GroupedSchemaNodesSummary nodes={members} apiNodeRendererProps={props} />
    </APINodeDetails>
  );
}
