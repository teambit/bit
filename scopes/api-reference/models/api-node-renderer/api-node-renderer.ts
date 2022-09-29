import { ComponentID } from '@teambit/component-id';
import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { ComponentType, ReactNode } from 'react';
// import { APINodeRendererSlot } from '@teambit/api-reference';

export type APINodeRenderProps = {
  node: SchemaNode;
  componentId: ComponentID;
};

export type APINodeRenderer = {
  predicate: (node: SchemaNode) => boolean;
  Component: ComponentType<APINodeRenderProps>;
  nodeType: string;
  getName: (node: SchemaNode) => string;
  icon: { Component: ReactNode; name: string };
  default?: boolean;
};
