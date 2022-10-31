import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { TypeIntersectionSchema } from '@teambit/semantics.entities.semantic-schema';

export const typeIntersectionRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeIntersectionSchema.name,
  Component: TypeIntersectionComponent,
  nodeType: 'TypeIntersection',
  default: true,
};

function TypeIntersectionComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    renderers,
  } = props;

  const typeNode = api as TypeIntersectionSchema;

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
