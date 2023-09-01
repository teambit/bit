import React, { HTMLAttributes, useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import defaultTheme from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';
import { SchemaNode, SetAccessorSchema } from '@teambit/semantics.entities.semantic-schema';
import { transformSignature } from '@teambit/api-reference.utils.schema-node-signature-transform';
import { APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
import { APINodeRenderProps, nodeStyles } from '@teambit/api-reference.models.api-node-renderer';
import { parameterRenderer as defaultParamRenderer } from '@teambit/api-reference.renderers.parameter';

import styles from './function-node-summary.module.scss';

export type FunctionNodeSummaryProps = {
  groupElementClassName?: string;
  node: SchemaNode;
  name: string;
  hideName?: boolean;
  headings: string[];
  apiRefModel: APIReferenceModel;
  returnType?: SchemaNode;
  params: SchemaNode[];
  apiNodeRendererProps: APINodeRenderProps;
} & HTMLAttributes<HTMLDivElement>;

export function FunctionNodeSummary({
  node,
  name,
  params,
  returnType,
  apiNodeRendererProps,
  hideName,
}: FunctionNodeSummaryProps) {
  const {
    __schema,
    doc,
    location: { filePath },
  } = node;
  const signature =
    __schema === SetAccessorSchema.name
      ? `(${(node as SetAccessorSchema).param.toString()}) => void`
      : transformSignature(node)?.split(name)[1];

  const { renderers } = apiNodeRendererProps;
  const returnTypeRenderer = returnType && renderers.find((renderer) => renderer.predicate(returnType));
  const lang = useMemo(() => {
    const langFromFileEnding = filePath?.split('.').pop();
    if (langFromFileEnding === 'scss' || langFromFileEnding === 'sass') return 'css';
    if (langFromFileEnding === 'mdx') return 'md';
    return langFromFileEnding;
  }, [filePath]);

  return (
    <div className={styles.summaryContainer}>
      <div className={styles.signatureTitle}>
        {!hideName && <div className={styles.functionName}>{name}</div>}
        {signature && (
          <SyntaxHighlighter
            language={lang}
            style={defaultTheme}
            customStyle={{
              borderRadius: '8px',
              marginTop: '8px',
              padding: '8px',
            }}
          >
            {signature}
          </SyntaxHighlighter>
        )}
      </div>
      <p className={styles.description}>{doc?.comment || ''}</p>

      {params.length > 0 && (
        <div className={styles.paramsContainer}>
          <h3 className={styles.subtitle}>Parameters</h3>
          {params.map((param) => {
            const paramRenderer = renderers.find((renderer) => renderer.predicate(param));
            if (paramRenderer?.Component) {
              return (
                <paramRenderer.Component
                  {...apiNodeRendererProps}
                  key={`param-${param.name}`}
                  depth={(apiNodeRendererProps.depth ?? 0) + 1}
                  apiNode={{ ...apiNodeRendererProps.apiNode, renderer: paramRenderer, api: param }}
                  metadata={{ [param.__schema]: { columnView: false } }}
                />
              );
            }
            return (
              <defaultParamRenderer.Component
                {...apiNodeRendererProps}
                key={`param-${param.name}`}
                depth={(apiNodeRendererProps.depth ?? 0) + 1}
                apiNode={{ ...apiNodeRendererProps.apiNode, renderer: defaultParamRenderer, api: param }}
                metadata={{ [param.__schema]: { columnView: false } }}
              />
            );
          })}
        </div>
      )}
      {returnType && (
        <div className={styles.returnContainer}>
          <h3 className={styles.subtitle}>Returns</h3>
          {(returnTypeRenderer && (
            <returnTypeRenderer.Component
              {...apiNodeRendererProps}
              apiNode={{ ...apiNodeRendererProps.apiNode, api: returnType, renderer: returnTypeRenderer }}
              depth={(apiNodeRendererProps.depth ?? 0) + 1}
            />
          )) || <div className={nodeStyles.node}>{returnType.toString()}</div>}
        </div>
      )}
    </div>
  );
}
