import type { HTMLAttributes } from 'react';
import React, { useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import type { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { SetAccessorSchema } from '@teambit/semantics.entities.semantic-schema';
import { transformSignature } from '@teambit/api-reference.utils.schema-node-signature-transform';
import type { APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
import type { APINodeRenderProps } from '@teambit/api-reference.models.api-node-renderer';
import { nodeStyles } from '@teambit/api-reference.models.api-node-renderer';
import { parameterRenderer as defaultParamRenderer } from '@teambit/api-reference.renderers.parameter';
import { HeadingRow } from '@teambit/documenter.ui.table-heading-row';
import defaultTheme from '@teambit/api-reference.utils.custom-prism-syntax-highlighter-theme';
import { extractCodeBlock } from '@teambit/api-reference.renderers.api-node-details';
import classNames from 'classnames';

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
      : (transformSignature(node)?.split(name)[1] ?? node.signature);

  const { renderers } = apiNodeRendererProps;
  const returnTypeRenderer = returnType && renderers.find((renderer) => renderer.predicate(returnType));
  const lang = useMemo(() => {
    const langFromFileEnding = filePath?.split('.').pop();
    if (langFromFileEnding === 'scss' || langFromFileEnding === 'sass') return 'css';
    if (langFromFileEnding === 'mdx') return 'md';
    return langFromFileEnding;
  }, [filePath]);
  const paramTypeHeadings = ['Parameter', 'type', 'default', 'description'];
  const docs = doc?.comment || doc?.raw;
  const example = (doc?.tags || []).find((tag) => tag.tagName === 'example');

  return (
    <div className={styles.summaryContainer}>
      <div className={styles.signatureTitle}>
        {<div className={classNames(styles.functionName, hideName && styles.hide)}>{hideName ? '' : name}</div>}
        {docs && <div className={styles.description}>{docs || ''}</div>}
        {signature && (
          <SyntaxHighlighter
            language={lang}
            style={defaultTheme}
            customStyle={{
              borderRadius: '8px',
              marginTop: '4px',
              padding: '6px',
            }}
          >
            {signature}
          </SyntaxHighlighter>
        )}
        {example && example.comment && (
          <div className={styles.apiNodeDetailsExample}>
            <div className={styles.apiNodeDetailsExampleTitle}>Example</div>
            <SyntaxHighlighter
              language={lang}
              style={defaultTheme}
              customStyle={{
                borderRadius: '8px',
                marginTop: '4px',
                padding: '12px',
              }}
              codeTagProps={{ style: { fontSize: '11px' } }}
            >
              {extractCodeBlock(example.comment)?.code || example.comment}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
      {params.length > 0 && (
        <div className={styles.paramsContainer}>
          <HeadingRow className={styles.paramHeading} headings={paramTypeHeadings} colNumber={4} />
          {params.map((param) => {
            const paramRenderer = renderers.find((renderer) => renderer.predicate(param));
            if (paramRenderer?.Component) {
              return (
                <paramRenderer.Component
                  key={`param-${param.name}`}
                  {...apiNodeRendererProps}
                  depth={(apiNodeRendererProps.depth ?? 0) + 1}
                  apiNode={{ ...apiNodeRendererProps.apiNode, renderer: paramRenderer, api: param }}
                  metadata={{ [param.__schema]: { columnView: true, skipHeadings: true } }}
                />
              );
            }
            return (
              <defaultParamRenderer.Component
                key={`param-${param.name}`}
                {...apiNodeRendererProps}
                depth={(apiNodeRendererProps.depth ?? 0) + 1}
                apiNode={{ ...apiNodeRendererProps.apiNode, renderer: defaultParamRenderer, api: param }}
                metadata={{ [param.__schema]: { columnView: true, skipHeadings: true } }}
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
