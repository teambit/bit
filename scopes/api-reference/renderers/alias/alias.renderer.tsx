import React from 'react';
import { AliasSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';

export const aliasRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === AliasSchema.name,
  Component: AliasComponent,
  nodeType: 'Aliases',
  icon: { name: 'Type', url: 'https://static.bit.dev/api-reference/type.svg' },
  default: true,
};

function AliasComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    renderers,
  } = props;
  const aliasSchema = api as AliasSchema;
  const { schema } = aliasSchema;

  const aliasSchemaRenderer = renderers.find((renderer) => renderer.predicate(schema));

  return (
    <APINodeDetails {...props} options={{ hideIndex: true }}>
      {aliasSchemaRenderer && (
        <aliasSchemaRenderer.Component
          {...props}
          apiNode={{ ...props.apiNode, api: schema }}
          depth={(props.depth ?? 0) + 1}
        />
      )}
    </APINodeDetails>
  );
}
