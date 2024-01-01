import React from 'react';
import { VariableLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer, nodeStyles } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';

export const variableRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === VariableLikeSchema.name,
  Component: VariableComponent,
  nodeType: 'Variables',
  icon: { name: 'Variable', url: 'https://static.bit.dev/api-reference/variable.svg' },
  default: true,
};

function VariableComponent(props: APINodeRenderProps) {
  const api = props.apiNode.api as VariableLikeSchema;
  if (props.depth) {
    const type = api.type;
    const typeRenderer = props.renderers.find((renderer) => renderer.predicate(type));
    return typeRenderer ? (
      <typeRenderer.Component
        {...props}
        apiNode={{ ...props.apiNode, api: type, renderer: typeRenderer }}
        depth={(props.depth ?? 0) + 1}
        metadata={{ [type.__schema]: { columnView: true } }}
      />
    ) : (
      <div className={nodeStyles.node}>{type.toString()}</div>
    );
  }
  return <APINodeDetails {...props} />;
}
