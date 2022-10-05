import React from 'react';
import { EnumSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { SchemaNodeDetails } from '@teambit/api-reference.renderers.schema-node-details';

export const enumRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === EnumSchema.name,
  Component: EnumComponent,
  nodeType: 'Enums',
  icon: { name: 'Enum', Component: EnumIcon },
  default: true,
};

function EnumComponent({ node, componentId }: APINodeRenderProps) {
  const enumNode = node as EnumSchema;
  const {
    name,
    doc,
    signature,
    location: { filePath, line },
    members,
  } = enumNode;
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
      members={members}
      signature={signature}
      example={example ? { content: example, path: docPath } : undefined}
      comment={comment}
    />
  );
}

function EnumIcon() {
  return <></>;
}
