import React from 'react';
import { TypeLiteralSchema, TypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';

export const typeRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeSchema.name,
  Component: TypeComponent,
  nodeType: 'Types',
  icon: { name: 'Type', url: 'https://static.bit.dev/api-reference/type.svg' },
  default: true,
};

/**
 * @todo - handle intersection types
 */
function TypeComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
  } = props;
  const typeNode = api as TypeSchema;
  const { type } = typeNode;
  const hasMembers = type.__schema === TypeLiteralSchema.name;
  const members = hasMembers ? (type as TypeLiteralSchema).members : [];

  return <APINodeDetails {...props} members={members} />;
}
