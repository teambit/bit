import React from 'react';
import { EnumSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { GroupedSchemaNodesSummary } from '@teambit/api-reference.renderers.grouped-schema-nodes-summary';
import { SchemaNodesSummary } from '@teambit/api-reference.overview.renderers.grouped-schema-nodes-overview-summary';

export const enumRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === EnumSchema.name,
  Component: EnumComponent,
  OverviewComponent: EnumOverviewComponent,
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

function EnumOverviewComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api, renderer },
  } = props;
  const enumNode = api as EnumSchema;
  const { members, doc } = enumNode;

  const icon = renderer.icon;
  const description =
    doc?.comment ?? doc?.tags?.filter((tag) => tag.comment).reduce((acc, tag) => acc.concat(`${tag.comment}\n`), '');
  return (
    <SchemaNodesSummary
      name={enumNode.name}
      description={description}
      icon={icon}
      nodes={members}
      apiNodeRendererProps={props}
    />
  );
}
