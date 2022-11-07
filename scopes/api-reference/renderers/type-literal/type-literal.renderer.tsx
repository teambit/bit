import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { copySchemaNode } from '@teambit/api-reference.utils.copy-schema-node';
import { GroupedSchemaNodesSummary } from '@teambit/api-reference.renderers.grouped-schema-nodes-summary';
import { TypeLiteralSchema } from '@teambit/semantics.entities.semantic-schema';

export const typeLiteralRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeLiteralSchema.name,
  Component: TypeLiteralComponent,
  nodeType: 'TypeLiteral',
  default: true,
};

function TypeLiteralComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
  } = props;
  const typeLiteralNode = api as TypeLiteralSchema;

  const members = typeLiteralNode.members.map((member) => {
    if (member.signature) return member;
    return copySchemaNode(member, { signature: member.toString() });
  });

  return <GroupedSchemaNodesSummary nodes={members} apiRefModel={props.apiRefModel} />;
}
