import React from 'react';
import { APINodeRenderer, APINodeRenderProps } from '@teambit/api-reference.models.api-node-renderer';
import { UnresolvedSchema } from '@teambit/semantics.entities.semantic-schema';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { SchemaNodeDetails } from '@teambit/api-reference.renderers.schema-node-details';

export const unresolvedRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === UnresolvedSchema.name,
  Component: UnresolvedComponent,
  nodeType: 'Unresolved',
  icon: { name: 'Unresolved', url: '' },
  default: true,
};

function UnresolvedComponent({ node, componentId }: APINodeRenderProps) {
  const unresolvedNode = node as UnresolvedSchema;
  const {
    name,
    location: { filePath, line },
  } = unresolvedNode;
  const componentIdUrl = ComponentUrl.toUrl(componentId, { includeVersion: false });
  const locationUrl = `${componentIdUrl}/~code/${filePath}${
    componentId.version ? `?version=${componentId.version}` : ''
  }`;
  const locationLabel = `${filePath}:${line}`;

  return <SchemaNodeDetails name={name} location={{ url: locationUrl, path: filePath, label: locationLabel }} />;
}
