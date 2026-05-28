import React from 'react';
import { FunctionLikeSchema, TagName } from '@teambit/semantics.entities.semantic-schema';
import type { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { nodeStyles } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import classnames from 'classnames';
import { parameterRenderer as defaultParamRenderer } from '@teambit/api-reference.renderers.parameter';
import { HeadingRow } from '@teambit/documenter.ui.table-heading-row';

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
    return <div className={nodeStyles.node}>{api.toString()}</div>;
  }

  const Params = params.map((param) => {
    const paramRenderer = renderers.find((renderer) => renderer.predicate(param));

    const ParamComponent = paramRenderer?.Component ? (
      <paramRenderer.Component
        key={`props-${param.name}`}
        {...props}
        depth={(props.depth ?? 0) + 1}
        apiNode={{ ...props.apiNode, renderer: paramRenderer, api: param }}
        metadata={{ [param.__schema]: { columnView: true, skipHeadings: true } }}
      />
    ) : (
      <defaultParamRenderer.Component
        key={`props-${param.name}`}
        {...props}
        depth={(props.depth ?? 0) + 1}
        apiNode={{ ...props.apiNode, renderer: defaultParamRenderer, api: param }}
        metadata={{ [param.__schema]: { columnView: true, skipHeadings: true } }}
      />
    );

    return ParamComponent;
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
      {Params.length > 0 && (
        <div key={`parameter-list`} className={styles.container}>
          <div className={styles.title}>Parameters</div>
          <HeadingRow
            className={styles.paramHeading}
            headings={['name', 'type', 'default', 'description']}
            colNumber={4}
          />
          {...Params}
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
          )) || <div className={nodeStyles.node}>{returnType.toString()}</div>}
        </div>
      </div>
    </APINodeDetails>
  );
}
