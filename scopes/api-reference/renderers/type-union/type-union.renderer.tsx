import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
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
    <div key={`${api.__schema}-${api.name}`} className={styles.node}>
      {typeNode.types.map((type, index, types) => {
        const typeRenderer = renderers.find((renderer) => renderer.predicate(type));

        if (typeRenderer) {
          return (
            <React.Fragment key={`typeUnionMember-container-${type.toString()}-${index}}`}>
              <typeRenderer.Component
                {...props}
                key={`typeUnionMember-${type.toString()}-${index}}`}
                apiNode={{ ...props.apiNode, api: type, renderer: typeRenderer }}
                depth={(props.depth ?? 0) + 1}
                metadata={{ [type.__schema]: { columnView: true } }}
              />
              {types.length > 1 && index !== types.length - 1 ? (
                <div key={`${type.name}-${index}-|`} className={classnames(styles.node, styles.padding2)}>
                  {'|'}
                </div>
              ) : null}
            </React.Fragment>
          );
        }

        return (
          <div key={`${type.name}-${index}`} className={styles.node}>
            {type.toString()}
            {types.length > 1 && index !== types.length - 1 ? (
              <div key={`${type.name}-${index}-|`} className={classnames(styles.node, styles.padding2)}>
                {'|'}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
