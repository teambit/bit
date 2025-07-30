import React from 'react';
import type { ReactSchema } from '@teambit/react';
import type { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { nodeStyles } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { parameterRenderer as defaultParamRenderer } from '@teambit/api-reference.renderers.parameter';
import classnames from 'classnames';
import { TagName } from '@teambit/semantics.entities.semantic-schema';
import { Link as BaseLink } from '@teambit/base-react.navigation.link';
// @todo - this will be fixed as part of the @teambit/base-react.navigation.link upgrade to latest
const Link = BaseLink as any;

import styles from './react.renderer.module.scss';

export const reactRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === 'ReactSchema',
  Component: ReactComponent,
  OverviewComponent: ReactOverviewComponent,
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
    return <div className={nodeStyles.node}>{api.toString()}</div>;
  }

  const paramRenderer = reactProps && renderers.find((renderer) => renderer.predicate(reactProps));
  const paramRef = reactProps?.type;
  const paramRefRenderer = paramRef && renderers.find((renderer) => renderer.predicate(paramRef));
  const PropsRefComponent =
    paramRef && paramRefRenderer?.Component ? (
      <paramRefRenderer.Component
        key={`props-ref-${reactProps.name}`}
        {...props}
        depth={(props.depth ?? 0) + 1}
        apiNode={{ ...props.apiNode, renderer: paramRefRenderer, api: paramRef }}
        metadata={{ [paramRef.__schema]: { columnView: true } }}
      />
    ) : null;

  const ParamComponent =
    reactProps && paramRenderer?.Component ? (
      <paramRenderer.Component
        key={`props-${reactProps.name}`}
        {...props}
        depth={(props.depth ?? 0) + 1}
        apiNode={{ ...props.apiNode, renderer: paramRenderer, api: reactProps }}
        metadata={{ [reactProps.__schema]: { columnView: true } }}
      />
    ) : (
      (reactProps && (
        <defaultParamRenderer.Component
          key={`props-${reactProps.name}`}
          {...props}
          depth={(props.depth ?? 0) + 1}
          apiNode={{ ...props.apiNode, renderer: defaultParamRenderer, api: reactProps }}
          metadata={{ [reactProps.__schema]: { columnView: true } }}
        />
      )) ||
      null
    );

  const docComment = api.doc?.findTag(TagName.return)?.comment;

  return (
    <APINodeDetails {...props} options={{ hideIndex: true }}>
      {typeParams && (
        <div className={classnames(styles.container, styles.typeParams, styles.topPad)}>
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
      {ParamComponent && (
        <div className={classnames(styles.container, styles.topPad)}>
          <div className={styles.title}>Props</div>
          <div className={styles.paramRef}>{PropsRefComponent}</div>
          {ParamComponent}
        </div>
      )}
      <div className={styles.container}>
        <div className={styles.title}>Returns</div>
        {docComment && <div className={styles.docComment}>{docComment}</div>}
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

function ReactOverviewComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    renderers,
    // apiRefModel,
  } = props;
  const reactNode = api as ReactSchema;
  const { returnType, props: reactProps } = reactNode;
  const returnTypeRenderer = renderers.find((renderer) => renderer.predicate(returnType));

  const paramRenderer = reactProps && renderers.find((renderer) => renderer.predicate(reactProps));
  const paramRef = reactProps?.type;
  const paramRefRenderer = paramRef && renderers.find((renderer) => renderer.predicate(paramRef));
  const PropsRefComponent =
    paramRef && paramRefRenderer?.Component ? (
      <paramRefRenderer.Component
        key={`props-ref-${reactProps.name}`}
        {...props}
        depth={(props.depth ?? 0) + 1}
        apiNode={{ ...props.apiNode, renderer: paramRefRenderer, api: paramRef }}
        metadata={{ [paramRef.__schema]: { columnView: true } }}
      />
    ) : null;

  const ParamComponent =
    reactProps && paramRenderer?.Component ? (
      <paramRenderer.Component
        key={`props-${reactProps.name}`}
        {...props}
        depth={(props.depth ?? 0) + 1}
        apiNode={{ ...props.apiNode, renderer: paramRenderer, api: reactProps }}
        metadata={{ [reactProps.__schema]: { columnView: true } }}
      />
    ) : (
      (reactProps && (
        <defaultParamRenderer.Component
          key={`props-${reactProps.name}`}
          {...props}
          depth={(props.depth ?? 0) + 1}
          apiNode={{ ...props.apiNode, renderer: defaultParamRenderer, api: reactProps }}
          metadata={{ [reactProps.__schema]: { columnView: true } }}
        />
      )) ||
      null
    );

  const docComment = api.doc?.findTag(TagName.return)?.comment;
  const icon = reactRenderer.icon;
  const description =
    api.doc?.comment ??
    api?.doc?.tags?.filter((tag) => tag.comment).reduce((acc, tag) => acc.concat(`${tag.comment}\n`), '');

  return (
    <div className={styles.reactOverview}>
      <div className={styles.reactOverviewHeader}>
        <div className={styles.headingLeft}>
          {icon && (
            <div className={styles.icon}>
              <img src={icon.url} alt={icon.name}></img>
            </div>
          )}
          <div className={styles.title}>
            <Link href={`~api-reference?selectedAPI=${api.name}`}>{api.name}</Link>
          </div>
        </div>
      </div>
      {description && <div className={styles.description}>{description}</div>}
      {ParamComponent && (
        <div className={classnames(styles.container, styles.topPad)}>
          <div className={styles.title}>Props</div>
          <div className={styles.paramRef}>{PropsRefComponent}</div>
          {ParamComponent}
        </div>
      )}
      <div className={styles.container}>
        <div className={styles.title}>Returns</div>
        {docComment && <div className={styles.docComment}>{docComment}</div>}
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
    </div>
  );
}
