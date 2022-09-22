import React from 'react';
import { ClassSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

export const classRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === ClassSchema.name,
  Component: ClassComponent,
  displayName: 'Classes',
  icon: { name: 'Class', Component: ClassIcon },
  default: true,
};

function ClassComponent({ /* name, */ displayName }: APINodeRenderProps) {
  // const classNode = node as ClassSchema;
  return <>{displayName}</>;
}

function ClassIcon() {
  return <></>;
}
