import React from 'react';
import { ClassSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { GroupedSchemaNodesSummary } from '@teambit/api-reference.renderers.grouped-schema-nodes-summary';

export const classRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === ClassSchema.name,
  Component: ClassComponent,
  nodeType: 'Classes',
  icon: { name: 'Class', url: 'https://static.bit.dev/api-reference/class.svg' },
  default: true,
};

function ClassComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
  } = props;
  const classNode = api as ClassSchema;
  const { extendsNodes, implementNodes, signature, members } = classNode;

  const extendsSignature = extendsNodes?.[0]?.name;
  const implementsDefinition = implementNodes?.[0]?.name;
  const displaySignature = `${signature}${(extendsSignature && ' '.concat(extendsSignature)) || ''} ${
    implementsDefinition || ''
  }`;

  return (
    <APINodeDetails {...props} displaySignature={displaySignature}>
      <GroupedSchemaNodesSummary nodes={members} apiRefModel={props.apiRefModel} />
    </APINodeDetails>
  );
}
