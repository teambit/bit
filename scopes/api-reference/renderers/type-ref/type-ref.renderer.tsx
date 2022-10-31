import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import classnames from 'classnames';

import styles from './type-ref.renderer.module.scss';

export const typeRefRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeRefSchema.name,
  Component: TypeRefComponent,
  nodeType: 'TypeRefs',
  default: true,
};

/**
 * @todo figure out how to render a type ref node
 */
function TypeRefComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
  } = props;
  const typeRefNode = api as TypeRefSchema;
  return (
    <APINodeDetails
      {...props}
      className={classnames(styles.container, props.className)}
      apiNode={{
        ...props.apiNode,
        api: {
          ...typeRefNode,
          name: `${typeRefNode.name}${typeRefNode.typeArgs ? ` <${typeRefNode.typeArgs}>` : ''}`,
          toObject: typeRefNode.toObject,
        },
      }}
      members={[typeRefNode]}
      options={{ hideImplementation: true, hideIndex: true }}
    ></APINodeDetails>
  );
}
