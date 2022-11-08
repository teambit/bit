import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
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
    <div key={`${api.__schema}-${api.name}`} className={styles.node}>
      {typeNode.types.map((type, index, types) => {
        const typeRenderer = renderers.find((renderer) => renderer.predicate(type));

        if (typeRenderer) {
          return (
            <>
              <typeRenderer.Component
                {...props}
                apiNode={{ ...props.apiNode, api: type, renderer: typeRenderer }}
                depth={(props.depth ?? 0) + 1}
                metadata={{ [type.__schema]: { columnView: true } }}
              />
              {types.length > 1 && index !== types.length - 1 ? (
                <div key={`${type.name}-${index}-&`} className={classnames(styles.node, styles.padding2)}>
                  {'&'}
                </div>
              ) : null}
            </>
          );
        }

        return (
          <div key={`${type.name}-${index}`} className={styles.node}>
            {type.toString()}
            {types.length > 1 && index !== types.length - 1 ? (
              <div key={`${type.name}-${index}-&`} className={classnames(styles.node, styles.padding2)}>
                {'&'}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
