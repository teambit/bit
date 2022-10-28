import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { ComponentType, HTMLAttributes } from 'react';
import { APINode, APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';

export type APINodeRenderProps = {
  apiNode: APINode;
  apiRefModel: APIReferenceModel;
} & HTMLAttributes<HTMLDivElement>;

export type APINodeRenderer = {
  predicate: (node: SchemaNode) => boolean;
  Component: ComponentType<APINodeRenderProps>;
  nodeType: string;
  icon: { url: string; name: string };
  default?: boolean;
};
