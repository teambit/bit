import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { TypeUnionSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaNodeSummary } from '@teambit/api-reference.renderers.schema-node-summary';

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
        if (!renderer)
          return (
            <SchemaNodeSummary
              signature={type.signature || type.toString()}
              name={type.name}
              location={type.location}
              doc={type.doc}
              isOptional={(type as any).isOptional}
              __schema={type.__schema}
            />
          );
        const Component = renderer.Component;
        return <Component {...props} key={index} apiNode={{ ...props.apiNode, renderer, api: type }} />;
      })}
    </>
  );
}
