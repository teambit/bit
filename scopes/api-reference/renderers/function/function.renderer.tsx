import React from 'react';
import { FunctionLikeSchema, SchemaNode, TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import classnames from 'classnames';
import { APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
import { Link } from '@teambit/base-react.navigation.link';
import { useUpdatedUrlFromQuery } from '@teambit/api-reference.hooks.use-api-ref-url';

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
    apiRefModel,
  } = props;
  const functionNode = api as FunctionLikeSchema;
  const { returnType, params, typeParams } = functionNode;
  const hasParams = params.length > 0;

  return (
    <APINodeDetails {...props}>
      {typeParams && (
        <div className={classnames(styles.container, styles.typeParams)}>
          <div className={styles.title}>Type Parameters</div>
          <div className={styles.values}>
            {typeParams.map((typeParam) => {
              return (
                <div className={classnames(styles.value, styles.bold)} key={typeParam}>
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
          <div className={styles.values}>
            {params.map((param) => {
              const [paramName, rawParamType] = param.toString().split(':');
              const paramType = rawParamType.trim();
              const apiNodeForParamType = apiRefModel.apiByName.get(paramType);
              return (
                <div className={styles.params} key={`${paramName}:${paramType}`}>
                  <div className={classnames(styles.paramName, styles.bold, styles.value)}>{paramName} :</div>
                  <div className={classnames(styles.paramValue, styles.value)}>
                    {(apiNodeForParamType && (
                      <Link
                        href={useUpdatedUrlFromQuery({
                          selectedAPI: `${apiNodeForParamType.renderer.nodeType}/${apiNodeForParamType.api.name}`,
                        })}
                      >
                        {paramType}
                      </Link>
                    )) ||
                      paramType}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className={styles.container}>
        <div className={styles.title}>Returns</div>
        <div className={styles.value}>{displayReturnType(returnType, apiRefModel)}</div>
      </div>
    </APINodeDetails>
  );
}

function displayReturnType(returnType: SchemaNode, apiRefModel: APIReferenceModel): React.ReactNode {
  if (returnType.__schema !== TypeRefSchema.name) return returnType.toString();
  const typeRefNode = returnType as TypeRefSchema;

  if (typeRefNode.componentId || typeRefNode.packageName) {
    const returnTypeName = returnType.toString().split(') ')[1];
    return returnTypeName;
  }

  const returnTypeName = returnType.name;
  const apiNode = returnTypeName ? apiRefModel.apiByName.get(returnTypeName) : undefined;

  return (
    (apiNode && (
      <Link href={useUpdatedUrlFromQuery({ selectedAPI: `${apiNode.renderer.nodeType}/${apiNode.api.name}` })}>
        {returnTypeName}
      </Link>
    )) ||
    returnTypeName
  );
}
