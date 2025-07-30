import React from 'react';
import type { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { nodeStyles } from '@teambit/api-reference.models.api-node-renderer';
import { copySchemaNode } from '@teambit/api-reference.utils.copy-schema-node';
import { GroupedSchemaNodesSummary } from '@teambit/api-reference.renderers.grouped-schema-nodes-summary';
import { TypeLiteralSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaNodesSummary } from '@teambit/api-reference.overview.renderers.grouped-schema-nodes-overview-summary';

export const typeLiteralRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeLiteralSchema.name,
  Component: TypeLiteralComponent,
  OverviewComponent: TypeLiteralOverviewComponent,
  nodeType: 'TypeLiteral',
  default: true,
};

function TypeLiteralComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
  } = props;
  const typeLiteralNode = api as TypeLiteralSchema;

  if (props.metadata?.[api.__schema]?.columnView) {
    return <div className={nodeStyles.node}>{api.toString()}</div>;
  }

  const members = typeLiteralNode.getNodes().map((node) => {
    if (node.signature) return node;
    return copySchemaNode(node, { signature: node.toString() });
  });
  return (
    <GroupedSchemaNodesSummary
      skipGrouping={props.metadata?.[api.__schema]?.columnView}
      nodes={members}
      apiNodeRendererProps={props}
      headings={{
        properties: ['name', 'type', 'description'],
      }}
    />
  );
}

function TypeLiteralOverviewComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api, renderer },
  } = props;
  const typeLiteralNode = api as TypeLiteralSchema;
  const { members, doc } = typeLiteralNode;

  const icon = renderer.icon;
  const description =
    doc?.comment ?? doc?.tags?.filter((tag) => tag.comment).reduce((acc, tag) => acc.concat(`${tag.comment}\n`), '');
  return (
    <SchemaNodesSummary
      name={typeLiteralNode.name ?? typeLiteralNode.toString()}
      description={description}
      icon={icon}
      nodes={members}
      apiNodeRendererProps={props}
    />
  );
}
