import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { TypeUnionSchema } from '@teambit/semantics.entities.semantic-schema';

export const typeUnionRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeUnionSchema.name,
  Component: TypeUnionComponent,
  nodeType: 'TypeUnion',
  default: true,
};

function TypeUnionComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    renderers,
  } = props;
  const typeNode = api as TypeUnionSchema;

  return (
    <>
      {typeNode.types.map((type, index) => {
        const renderer = renderers.find((r) => r.predicate(type));
        if (!renderer) return null;
        const Component = renderer.Component;
        return <Component {...props} key={index} apiNode={{ ...props.apiNode, api: type }} />;
      })}
    </>
  );
}
