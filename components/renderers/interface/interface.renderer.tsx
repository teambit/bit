import React from 'react';
import { InterfaceSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { GroupedSchemaNodesSummary } from '@teambit/api-reference.renderers.grouped-schema-nodes-summary';
import { SchemaNodesSummary } from '@teambit/api-reference.overview.renderers.grouped-schema-nodes-overview-summary';

export const interfaceRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === InterfaceSchema.name,
  Component: InterfaceComponent,
  OverviewComponent: InterfaceOverviewComponent,
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

function InterfaceOverviewComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api, renderer },
  } = props;
  const interfaceNode = api as InterfaceSchema;
  const { members, doc } = interfaceNode;

  const icon = renderer.icon;
  const description =
    doc?.comment ?? doc?.tags?.filter((tag) => tag.comment).reduce((acc, tag) => acc.concat(`${tag.comment}\n`), '');

  return (
    <SchemaNodesSummary
      name={interfaceNode.name}
      description={description}
      icon={icon}
      nodes={members}
      apiNodeRendererProps={props}
    />
  );
}
