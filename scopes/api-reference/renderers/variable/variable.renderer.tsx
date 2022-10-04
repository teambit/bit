import React from 'react';
import { VariableLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { SchemaNodeDetails } from '@teambit/api-reference.renderers.schema-node-details';

export const variableRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === VariableLikeSchema.name,
  Component: VariableComponent,
  nodeType: 'Variables',
  icon: { name: 'Variable', Component: VariableIcon },
  default: true,
};

function VariableComponent({ node, componentId }: APINodeRenderProps) {
  const variableNode = node as VariableLikeSchema;
  const {
    name,
    doc,
    signature,
    location: { filePath, line },
  } = variableNode;
  const comment = doc?.comment;
  const tags = doc?.tags || [];
  const docPath = `${doc?.location.line}:${doc?.location.filePath}`;

  const example = tags.find((tag) => tag.tagName === 'example')?.comment;

  const componentIdUrl = ComponentUrl.toUrl(componentId, { includeVersion: false });
  const locationUrl = `${componentIdUrl}/~code/${filePath}${
    componentId.version ? `?version=${componentId.version}` : ''
  }`;
  const locationLabel = `${filePath}:${line}`;

  return (
    <SchemaNodeDetails
      name={name}
      location={{ url: locationUrl, path: filePath, label: locationLabel }}
      signature={signature}
      example={example ? { content: example, path: docPath } : undefined}
      comment={comment}
    />
  );
}

function VariableIcon() {
  return <></>;
}
