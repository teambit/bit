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
    metadata,
    // depth
  } = props;
  const classNode = api as ClassSchema;
  const { extendsNodes, implementNodes, signature, members } = classNode;

  if (metadata?.columnView?.[api.__schema]) {
    // todo handle when recursively rendering a class
    return <React.Fragment key={`class-column-view-${classNode.toString()}`}>{classNode.toString()}</React.Fragment>;
  }

  const extendsSignature = extendsNodes?.[0]?.name;
  const implementsDefinition = implementNodes?.[0]?.name;
  const displaySignature = `${signature}${(extendsSignature && ' '.concat(extendsSignature)) || ''} ${
    implementsDefinition || ''
  }`;

  return (
    <APINodeDetails {...props} displaySignature={displaySignature}>
      <GroupedSchemaNodesSummary nodes={members} apiNodeRendererProps={props} />
    </APINodeDetails>
  );
}
