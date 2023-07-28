import React from 'react';
import { ReactSchema } from '@teambit/react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { parameterRenderer as defaultParamRenderer } from '@teambit/api-reference.renderers.parameter';
import { HeadingRow } from '@teambit/documenter.ui.table-heading-row';
import classnames from 'classnames';

import styles from './react.renderer.module.scss';

export const reactRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === ReactSchema.name,
  Component: ReactComponent,
  nodeType: 'React',
  icon: { name: 'React', url: 'https://static.bit.dev/extensions-icons/react.svg' },
  default: true,
};

function ReactComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    renderers,
    // apiRefModel,
  } = props;
  const reactNode = api as ReactSchema;
  const { returnType, props: reactProps, typeParams } = reactNode;
  const returnTypeRenderer = renderers.find((renderer) => renderer.predicate(returnType));

  if (props.metadata?.[api.__schema]?.columnView) {
    return <div className={styles.node}>{api.toString()}</div>;
  }

  const paramRenderer = renderers.find((renderer) => renderer.predicate(reactProps));
  const paramRef = reactProps.type;
  const paramRefRenderer = paramRef && renderers.find((renderer) => renderer.predicate(paramRef));
  const PropsRefComponent =
    paramRef && paramRefRenderer?.Component ? (
      <paramRefRenderer.Component
        {...props}
        key={`props-ref-${reactProps.name}`}
        depth={(props.depth ?? 0) + 1}
        apiNode={{ ...props.apiNode, renderer: paramRefRenderer, api: paramRef }}
        metadata={{ [paramRef.__schema]: { columnView: true } }}
      />
    ) : null;
  const ParamComponent = paramRenderer?.Component ? (
    <paramRenderer.Component
      {...props}
      key={`props-${reactProps.name}`}
      depth={(props.depth ?? 0) + 1}
      apiNode={{ ...props.apiNode, renderer: paramRenderer, api: reactProps }}
      metadata={{ [reactProps.__schema]: { columnView: true } }}
    />
  ) : (
    <defaultParamRenderer.Component
      {...props}
      key={`props-${reactProps.name}`}
      depth={(props.depth ?? 0) + 1}
      apiNode={{ ...props.apiNode, renderer: defaultParamRenderer, api: reactProps }}
      metadata={{ [reactProps.__schema]: { columnView: true } }}
    />
  );

  return (
    <APINodeDetails {...props} options={{ hideIndex: true }}>
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
      {
        <div className={styles.container}>
          <div className={styles.title}>Props</div>
          <div className={styles.paramRef}>{PropsRefComponent}</div>
          {ParamComponent}
        </div>
      }
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
