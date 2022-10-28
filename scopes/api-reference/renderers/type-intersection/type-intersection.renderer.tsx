import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
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
  console.log('🚀 ~ file: type-intersection.renderer.tsx ~ line 19 ~ TypeIntersectionComponent ~ typeNode', typeNode);

  return <APINodeDetails {...props} />;
}
