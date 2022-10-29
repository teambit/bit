import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { TypeUnionSchema } from '@teambit/semantics.entities.semantic-schema';
import classnames from 'classnames';

import styles from './type-union.renderer.module.scss';

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
    <APINodeDetails
      {...props}
      className={classnames(styles.container, props.className)}
      options={{ hideImplementation: true, hideIndex: true }}
    >
      {typeNode.types.map((type, index) => {
        const renderer = renderers.find((r) => r.predicate(type));
        if (!renderer) return null;
        const Component = renderer.Component;
        return <Component {...props} key={index} apiNode={{ ...props.apiNode, api: type }} />;
      })}
    </APINodeDetails>
  );
}
