import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { TypeLiteralSchema } from '@teambit/semantics.entities.semantic-schema';
import classnames from 'classnames';

import styles from './type-literal.renderer.module.scss';

export const typeLiteralRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeLiteralSchema.name,
  Component: TypeLiteralComponent,
  nodeType: 'TypeLiteral',
  default: true,
};

function TypeLiteralComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
  } = props;
  const typeLiteralNode = api as TypeLiteralSchema;

  return (
    <APINodeDetails
      {...props}
      className={classnames(styles.container, props.className)}
      apiNode={{ ...props.apiNode, api: typeLiteralNode }}
      members={typeLiteralNode.members}
      options={{ hideImplementation: true, hideIndex: true }}
    />
  );
}
