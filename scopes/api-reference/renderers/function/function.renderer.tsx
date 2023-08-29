import React from 'react';
import { FunctionLikeSchema, TagName } from '@teambit/semantics.entities.semantic-schema';
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
    // apiRefModel,
  } = props;
  const functionNode = api as FunctionLikeSchema;
  const { returnType, params, typeParams } = functionNode;
  const returnTypeRenderer = renderers.find((renderer) => renderer.predicate(returnType));

  if (props.metadata?.[api.__schema]?.columnView) {
    return <div className={styles.node}>{api.toString()}</div>;
  }

  const Params = params.map((param) => {
    // console.log("🚀 ~ file: function.renderer.tsx:79 ~ Params ~ param:", param)
    // const paramRenderer = renderers.find((renderer) => renderer.predicate(param));
    const paramRef = param.type;
    // console.log("🚀 ~ file: function.renderer.tsx:36 ~ Params ~ paramRef:", paramRef)
    const paramRefRenderer = paramRef && renderers.find((renderer) => renderer.predicate(paramRef));
    // console.log("🚀 ~ file: function.renderer.tsx:38 ~ Params ~ paramRefRenderer:", paramRefRenderer)
    const PropsRefComponent =
      paramRef && paramRefRenderer?.Component ? (
        <paramRefRenderer.Component
          {...props}
          key={`props-ref-${param.name}`}
          depth={(props.depth ?? 0) + 1}
          apiNode={{ ...props.apiNode, renderer: paramRefRenderer, api: paramRef }}
          metadata={{ [paramRef.__schema]: { columnView: true } }}
        />
      ) : null;

    return (
      <div key={`param-${param.name}-${param.__schema}`} className={classnames(styles.container, styles.topPad)}>
        <div className={styles.subTitle}>{param.name}</div>
        <div className={styles.paramRef}>{PropsRefComponent}</div>
        {/* {ParamComponent} */}
      </div>
    );
  });

  const returnDocComment = api.doc?.findTag(TagName.return)?.comment;

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
      <div className={styles.title}>Parameters</div>
      <div className={styles.containerList}>{...Params}</div>
      <div className={styles.container}>
        <div className={styles.title}>Returns</div>
        {returnDocComment && <div className={styles.docComment}>{returnDocComment}</div>}
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
      {/* {hasParams && (
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
                <defaultParamRenderer.Component
                  {...props}
                  key={`param-${param.name}`}
                  depth={(props.depth ?? 0) + 1}
                  apiNode={{ ...props.apiNode, renderer: defaultParamRenderer, api: param }}
                  metadata={{ [param.__schema]: { columnView: true } }}
                />
              );
            })}
          </div>
        </div>
      )}
      <div className={styles.container}>
        <div className={styles.title}>Returns</div>
        {returnDocComment && <div className={styles.docComment}>{returnDocComment}</div>}
        <div className={styles.returnType}>
          {(returnTypeRenderer && (
            <returnTypeRenderer.Component
              {...props}
              apiNode={{ ...props.apiNode, api: returnType, renderer: returnTypeRenderer }}
              depth={(props.depth ?? 0) + 1}
            />
          )) || <div className={styles.node}>{returnType.toString()}</div>}
        </div>
      </div> */}
    </APINodeDetails>
  );
}
