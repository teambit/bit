import React from 'react';
import { FunctionLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { parameterRenderer } from '@teambit/api-reference.renderers.parameter';
import { HeadingRow } from '@teambit/documenter.ui.table-heading-row';
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
    // apiRefModel,
  } = props;
  const functionNode = api as FunctionLikeSchema;
  const { returnType, params, typeParams } = functionNode;
  const returnTypeRenderer = renderers.find((renderer) => renderer.predicate(returnType));

  if (props.metadata?.[api.__schema]?.columnView) {
    return <div className={styles.node}>{api.toString()}</div>;
  }

  const hasParams = params.length > 0;

  return (
    <APINodeDetails
      {...props}
      options={{ hideIndex: (props.depth ?? 0) > 0, hideImplementation: (props.depth ?? 0) > 0 }}
    >
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
          <div className={styles.table}>
            <HeadingRow colNumber={4} headings={['name', 'type', 'default', 'description']} />
            {params.map((param) => {
              const paramRenderer = renderers.find((renderer) => renderer.predicate(param));
              if (paramRenderer?.Component) {
                return (
                  <paramRenderer.Component
                    {...props}
                    key={`param-${param.name}`}
                    depth={(props.depth ?? 0) + 1}
                    apiNode={{ ...props.apiNode, renderer: paramRenderer, api: param }}
                    metadata={{ [param.__schema]: { columnView: true } }}
                  />
                );
              }
              return (
                <parameterRenderer.Component
                  {...props}
                  key={`param-${param.name}`}
                  depth={(props.depth ?? 0) + 1}
                  apiNode={{ ...props.apiNode, renderer: parameterRenderer, api: param }}
                  metadata={{ [param.__schema]: { columnView: true } }}
                />
              );
            })}
          </div>
        </div>
      )}
      <div className={styles.container}>
        <div className={styles.title}>Returns</div>
        <div className={styles.returnType}>
          {(returnTypeRenderer && (
            <returnTypeRenderer.Component
              {...props}
              apiNode={{ ...props.apiNode, api: returnType, renderer: returnTypeRenderer }}
              depth={(props.depth ?? 0) + 1}
            />
          )) || <div className={styles.node}>{returnType.toString()}</div>}
        </div>
      </div>
    </APINodeDetails>
  );
}
