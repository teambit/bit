import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { ComponentType, ReactNode } from 'react';

export type APINodeRenderProps = {
  node: SchemaNode;
  displayName: string;
};

export type APINodeRenderer = {
  predicate: (node: SchemaNode) => boolean;
  Component: ComponentType<APINodeRenderProps>;
  displayName: string;
  icon: { Component: ReactNode; name: string };
};
