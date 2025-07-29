import React from 'react';
import { TypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { SchemaNodesSummary } from '@teambit/api-reference.overview.renderers.grouped-schema-nodes-overview-summary';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';

export const typeRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeSchema.name,
  Component: TypeComponent,
  nodeType: 'Types',
  icon: { name: 'Type', url: 'https://static.bit.dev/api-reference/type.svg' },
  default: true,
  OverviewComponent: TypeOverviewComponent,
};

function TypeComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    renderers,
    metadata,
  } = props;
  const typeNode = api as TypeSchema;
  const { type } = typeNode;

  const subTypeRenderer = renderers.find((renderer) => renderer.predicate(type));

  if (metadata?.[api.__schema]?.columnView) {
    return (
      (subTypeRenderer && (
        <subTypeRenderer.Component
          {...props}
          apiNode={{ ...props.apiNode, api: type, renderer: subTypeRenderer }}
          depth={(props.depth ?? 0) + 1}
          metadata={{ [type.__schema]: { columnView: true } }}
        />
      )) ||
      null
    );
  }

  return (
    <APINodeDetails {...props} options={{ hideIndex: true }}>
      {subTypeRenderer && (
        <subTypeRenderer.Component
          {...props}
          apiNode={{ ...props.apiNode, api: type, renderer: subTypeRenderer }}
          depth={(props.depth ?? 0) + 1}
        />
      )}
    </APINodeDetails>
  );
}

function TypeOverviewComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api, renderer },
  } = props;
  const typeNode = api as TypeSchema;
  const icon = renderer?.icon;
  const { type } = typeNode;
  const nodes = type.getNodes();
  return <SchemaNodesSummary name={typeNode.name} nodes={nodes} icon={icon} apiNodeRendererProps={props} />;
}
