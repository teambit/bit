/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { TypeArraySchema } from '@teambit/semantics.entities.semantic-schema';
import styles from './type-array.renderer.module.scss';

export const typeArrayRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeArraySchema.name,
  Component: TypeArrayComponent,
  nodeType: 'TypeArray',
  default: true,
};

function TypeArrayComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    renderers,
  } = props;

  const typeArray = api as TypeArraySchema;
  const typeRenderer = renderers.find((renderer) => renderer.predicate(typeArray.type));

  if (typeRenderer) {
    return (
      <div key={`${api.__schema}-${api.name}`} className={styles.node}>
        <typeRenderer.Component
          {...props}
          apiNode={{ ...props.apiNode, api: typeArray.type, renderer: typeRenderer }}
          depth={(props.depth ?? 0) + 1}
          metadata={{ [typeArray.type.__schema]: { columnView: true } }}
        />
        {'[]'}
      </div>
    );
  }

  return (
    <div key={`${api.__schema}-${api.name}`} className={styles.node}>
      {typeArray.toString()}
    </div>
  );
}
