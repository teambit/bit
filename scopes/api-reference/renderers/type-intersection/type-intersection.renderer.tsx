import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { TypeIntersectionSchema } from '@teambit/semantics.entities.semantic-schema';
import classnames from 'classnames';

import styles from './type-intersection.renderer.module.scss';

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
