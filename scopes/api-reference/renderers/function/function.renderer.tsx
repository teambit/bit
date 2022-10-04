import React from 'react';
import { FunctionLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { SchemaNodeDetails } from '@teambit/api-reference.renderers.schema-node-details';
import { ComponentUrl } from '@teambit/component.modules.component-url';

export const functionRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === FunctionLikeSchema.name,
  Component: FunctionComponent,
  nodeType: 'Functions',
  icon: { name: 'Function', Component: FunctionIcon },
  default: true,
};

function FunctionComponent({ node, componentId }: APINodeRenderProps) {
  const functionNode = node as FunctionLikeSchema;
  const {
    name,
    location: { filePath, line },
    doc,
    signature,
  } = functionNode;

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

function FunctionIcon() {
  return <></>;
}
