import React from 'react';
import { ClassSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { SchemaNodeDetails } from '@teambit/api-reference.renderers.schema-node-details';

export const classRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === ClassSchema.name,
  Component: ClassComponent,
  nodeType: 'Classes',
  icon: { name: 'Class', Component: ClassIcon },
  default: true,
};

function ClassComponent({ node, componentId }: APINodeRenderProps) {
  const classNode = node as ClassSchema;
  const {
    name,
    doc,
    extendsNodes,
    implementNodes,
    signature,
    location: { filePath, line },
    members,
  } = classNode;
  const comment = doc?.comment;
  const tags = doc?.tags || [];
  const docPath = `${doc?.location.line}:${doc?.location.filePath}`;

  const example = tags.find((tag) => tag.tagName === 'example')?.comment;
  const extendsSignature = extendsNodes?.[0]?.name;
  const implementsDefinition = implementNodes?.[0]?.name;
  const fullSignature = `${signature}${(extendsSignature && ' '.concat(extendsSignature)) || ''} ${
    implementsDefinition || ''
  }`;
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
      signature={fullSignature}
      example={example ? { content: example, path: docPath } : undefined}
      comment={comment}
    />
  );
}

function ClassIcon() {
  return <></>;
}
