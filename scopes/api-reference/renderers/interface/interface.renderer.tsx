import React from 'react';
import { InterfaceSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { SchemaNodeDetails } from '@teambit/api-reference.renderers.schema-node-details';

export const interfaceRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === InterfaceSchema.name,
  Component: InterfaceComponent,
  nodeType: 'Interfaces',
  icon: { name: 'Interface', Component: InterfaceIcon },
  default: true,
};

function InterfaceComponent({ node, componentId }: APINodeRenderProps) {
  const interfaceNode = node as InterfaceSchema;
  const {
    name,
    doc,
    extendsNodes,
    signature,
    location: { filePath, line },
    members,
  } = interfaceNode;
  const comment = doc?.comment;
  const tags = doc?.tags || [];
  const docPath = `${doc?.location.line}:${doc?.location.filePath}`;

  const example = tags.find((tag) => tag.tagName === 'example')?.comment;
  const extendsSignature = extendsNodes?.[0]?.name;
  const fullSignature = `${signature}${(extendsSignature && ' '.concat(extendsSignature)) || ''}`;
  const componentIdUrl = ComponentUrl.toUrl(componentId, { includeVersion: false });
  const locationUrl = `${componentIdUrl}/~code/${filePath}?version=${componentId.version}`;
  const locationLabel = `${filePath}:${line}`;

  return (
    <SchemaNodeDetails
      name={name}
      location={{ url: locationUrl, path: filePath, label: locationLabel }}
      members={members}
      signature={fullSignature}
      example={example ? { content: example, path: docPath } : undefined}
      comment={comment}
    />
  );
}

function InterfaceIcon() {
  return <></>;
}
