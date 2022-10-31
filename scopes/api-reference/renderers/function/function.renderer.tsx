import React from 'react';
import { FunctionLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import classnames from 'classnames';

import styles from './function.renderer.module.scss';

export const functionRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === FunctionLikeSchema.name,
  Component: FunctionComponent,
  nodeType: 'Functions',
  icon: { name: 'Function', url: 'https://static.bit.dev/api-reference/function.svg' },
  default: true,
};

function FunctionComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    renderers,
  } = props;
  const functionNode = api as FunctionLikeSchema;
  const { returnType, params, typeParams } = functionNode;
  const returnTypeRenderer = renderers.find((renderer) => renderer.predicate(returnType));
  const hasParams = params.length > 0;

  return (
    <APINodeDetails {...props}>
      {typeParams && (
        <div className={classnames(styles.container, styles.typeParams)}>
          <div className={styles.title}>Type Parameters</div>
          <div className={styles.values}>
            {typeParams.map((typeParam) => {
              return (
                <div className={classnames(styles.value)} key={typeParam}>
                  {typeParam}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {hasParams && (
        <div className={styles.container}>
          <div className={styles.title}>Parameters</div>
          <div>
            {params.map((param) => {
              const Component = renderers.find((renderer) => renderer.predicate(param))?.Component;
              if (Component) {
                return <Component {...props} key={`param-${param.name}`} apiNode={{ ...props.apiNode, api: param }} />;
              }
              return (
                <div key={`param-${param.name}`} className={styles.value}>
                  {param.toString()}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className={styles.container}>
        <div className={styles.title}>Returns</div>
        {!returnTypeRenderer && <div className={styles.value}>{returnType.toString()}</div>}
        {returnTypeRenderer && (
          <returnTypeRenderer.Component {...props} apiNode={{ ...props.apiNode, api: returnType }} />
        )}
      </div>
    </APINodeDetails>
  );
}
