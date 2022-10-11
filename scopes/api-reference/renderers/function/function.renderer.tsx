import React from 'react';
import { FunctionLikeSchema, SchemaNode, TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { SchemaNodeDetails } from '@teambit/api-reference.renderers.schema-node-details';
import { ComponentUrl } from '@teambit/component.modules.component-url';
// import { defaultCodeEditorOptions } from '@teambit/api-reference.utils.code-editor-options';
// import { CodeEditor } from '@teambit/code.monaco.code-editor';
import classnames from 'classnames';

import styles from './function.renderer.module.scss';

export const functionRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === FunctionLikeSchema.name,
  Component: FunctionComponent,
  nodeType: 'Functions',
  icon: { name: 'Function', Component: FunctionIcon },
  default: true,
};

function FunctionComponent({ node, componentId }: APINodeRenderProps) {
  const functionNode = node as FunctionLikeSchema;
  const {
    name,
    location: { filePath, line },
    doc,
    signature,
    returnType,
    params,
    typeParams,
  } = functionNode;

  const comment = doc?.comment;
  const tags = doc?.tags || [];
  const docPath = `${doc?.location.line}:${doc?.location.filePath}`;

  const example = tags.find((tag) => tag.tagName === 'example')?.comment;
  const componentIdUrl = ComponentUrl.toUrl(componentId, { includeVersion: false });
  const locationUrl = `${componentIdUrl}/~code/${filePath}${
    componentId.version ? `?version=${componentId.version}` : ''
  }`;
  const locationLabel = `${filePath}:${line}`;
  const hasParams = params.length > 0;

  return (
    <SchemaNodeDetails
      name={name}
      location={{ url: locationUrl, path: filePath, label: locationLabel }}
      signature={signature}
      example={example ? { content: example, path: docPath } : undefined}
      comment={comment}
    >
      {typeParams && (
        <div className={classnames(styles.container, styles.typeParams)}>
          <div className={styles.title}>Type Parameters</div>
          <div className={styles.values}>
            {typeParams.map((typeParam, index) => (
              <div className={classnames(styles.value, styles.bold)} key={index}>
                {typeParam}
              </div>
            ))}
          </div>
        </div>
      )}
      {hasParams && (
        <div className={styles.container}>
          <div className={styles.title}>Parameters</div>
          <div className={styles.values}>
            {params.map((param, index) => {
              const [paramName, paramType] = param.toString().split(':');
              return (
                <div className={styles.params} key={index}>
                  <div className={classnames(styles.paramName, styles.bold, styles.value)}>{paramName} :</div>
                  <div className={classnames(styles.paramValue, styles.value)}>{paramType}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className={styles.container}>
        <div className={styles.title}>Returns</div>
        <div className={styles.value}>{displayReturnType(returnType)}</div>
      </div>
    </SchemaNodeDetails>
  );
}

function displayReturnType(returnType: SchemaNode): string | undefined {
  if (returnType.__schema !== TypeRefSchema.name) return returnType.toString();
  const typeRefNode = returnType as TypeRefSchema;
  if (typeRefNode.componentId || typeRefNode.packageName) return returnType.toString().split(') ')[1];
  return returnType.toString();
}

function FunctionIcon() {
  return <></>;
}
