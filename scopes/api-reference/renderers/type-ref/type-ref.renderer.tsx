/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { copySchemaNode } from '@teambit/api-reference.utils.copy-schema-node';
import { TypeInfoFromSchemaNode } from '@teambit/api-reference.utils.type-info-from-schema-node';

import styles from './type-ref.renderer.module.scss';

export const typeRefRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeRefSchema.name,
  Component: TypeRefComponent,
  nodeType: 'TypeRefs',
  icon: { name: 'TypeRef', url: 'https://static.bit.dev/api-reference/type.svg' },
  default: true,
};

/**
 * @todo figure out how to render deeply nested typeArgs
 */
function TypeRefComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    apiRefModel,
    depth,
    renderers,
    ...rest
  } = props;
  const typeRefNode = api as TypeRefSchema;

  if (props.depth === 0) {
    return (
      <APINodeDetails
        {...props}
        apiNode={{
          ...props.apiNode,
          api: copySchemaNode(typeRefNode, { signature: typeRefNode.signature || typeRefNode.toString() }),
        }}
      />
    );
  }

  return (
    <div className={styles.container}>
      <TypeInfoFromSchemaNode key={`type-ref-${typeRefNode.__schema}`} node={typeRefNode} apiRefModel={apiRefModel} />
    </div>
  );
}
