import React from 'react';
import { EnumSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { GroupedSchemaNodesSummary } from '@teambit/api-reference.renderers.grouped-schema-nodes-summary';

export const enumRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === EnumSchema.name,
  Component: EnumComponent,
  nodeType: 'Enums',
  icon: { name: 'Enum', url: 'https://static.bit.dev/api-reference/array.svg' },
  default: true,
};

function EnumComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
  } = props;
  const enumNode = api as EnumSchema;
  const { members } = enumNode;

  return (
    <APINodeDetails {...props} options={{ hideIndex: true }}>
      <GroupedSchemaNodesSummary nodes={members} apiNodeRendererProps={props} />
    </APINodeDetails>
  );
}
