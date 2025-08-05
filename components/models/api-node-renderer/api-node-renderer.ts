import type { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import type { ComponentType, HTMLAttributes } from 'react';
import type { APINode, APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';

export type APINodeRenderProps = {
  apiNode: APINode;
  apiRefModel: APIReferenceModel;
  renderers: APINodeRenderer[];
  depth?: number;
  metadata?: Record<string, any>;
} & HTMLAttributes<HTMLDivElement>;

export type APINodeRenderer = {
  predicate: (node: SchemaNode) => boolean;
  Component: ComponentType<APINodeRenderProps>;
  OverviewComponent?: ComponentType<APINodeRenderProps>;
  nodeType: string;
  icon?: { url: string; name: string };
  default?: boolean;
};
