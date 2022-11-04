import React from 'react';
import { TypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';

export const typeRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeSchema.name,
  Component: TypeComponent,
  nodeType: 'Types',
  icon: { name: 'Type', url: 'https://static.bit.dev/api-reference/type.svg' },
  default: true,
};

function TypeComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    renderers,
  } = props;
  const typeNode = api as TypeSchema;
  const { type } = typeNode;

  const subTypeRenderer = renderers.find((renderer) => renderer.predicate(type));

  return (
    <APINodeDetails {...props}>
      {subTypeRenderer && (
        <subTypeRenderer.Component
          {...props}
          apiNode={{ ...props.apiNode, api: type }}
          depth={(props.depth ?? 0) + 1}
        />
      )}
    </APINodeDetails>
  );
}
