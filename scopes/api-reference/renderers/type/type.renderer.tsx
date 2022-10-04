import React from 'react';
import { TypeLiteralSchema, TypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { SchemaNodeDetails } from '@teambit/api-reference.renderers.schema-node-details';

export const typeRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeSchema.name,
  Component: TypeComponent,
  nodeType: 'Types',
  icon: { name: 'Type', Component: TypeIcon },
  default: true,
};

/**
 * @todo - handle intersection types
 */
function TypeComponent({ node, componentId }: APINodeRenderProps) {
  const typeNode = node as TypeSchema;
  const {
    name,
    doc,
    signature,
    location: { filePath, line },
    type,
  } = typeNode;
  const comment = doc?.comment;
  const tags = doc?.tags || [];
  const docPath = `${doc?.location.line}:${doc?.location.filePath}`;

  const example = tags.find((tag) => tag.tagName === 'example')?.comment;

  const componentIdUrl = ComponentUrl.toUrl(componentId, { includeVersion: false });
  const locationUrl = `${componentIdUrl}/~code/${filePath}${
    componentId.version ? `?version=${componentId.version}` : ''
  }`;
  const locationLabel = `${filePath}:${line}`;
  const hasMembers = type.__schema === TypeLiteralSchema.name;
  const members = hasMembers ? (type as TypeLiteralSchema).members : [];

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

function TypeIcon() {
  return <></>;
}
