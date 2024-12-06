import React from 'react';
import { APINodeRenderProps, APINodeRenderer, nodeStyles } from '@teambit/api-reference.models.api-node-renderer';
import { InferenceTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light';
import tsxSyntax from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import defaultTheme from '@teambit/api-reference.utils.custom-prism-syntax-highlighter-theme';
import classNames from 'classnames';
import { Tooltip } from '@teambit/design.ui.tooltip';

import styles from './inference-type.module.scss';

SyntaxHighlighter.registerLanguage('tsx', tsxSyntax);

export const inferenceTypeRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === InferenceTypeSchema.name,
  Component: InferenceTypeComponent,
  nodeType: 'InferenceType',
  default: true,
};

function InferenceTypeComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    className,
    metadata,
  } = props;

  const inferenceTypeNode = api as InferenceTypeSchema;
  const isSpread = inferenceTypeNode.isSpread;
  const typeToRender = (inferenceTypeNode.type || inferenceTypeNode.name) ?? '';

  const maybeObject = typeToRender.includes('{');
  const disableHighlight = metadata?.[inferenceTypeNode.__schema]?.disableHighlight || !maybeObject;

  const lang = React.useMemo(() => {
    const langFromFileEnding = api.location.filePath?.split('.').pop();
    if (langFromFileEnding === 'scss' || langFromFileEnding === 'sass') return 'css';
    if (langFromFileEnding === 'mdx') return 'md';
    return langFromFileEnding;
  }, [api.location.filePath]);

  return (
    <div
      key={`inference-${inferenceTypeNode.name}`}
      className={classNames(nodeStyles.node, className, styles.inferenceWrapper, isSpread && styles.isSpread)}
    >
      {isSpread && (
        <Tooltip
          className={styles.syntaxTooltip}
          placement={'bottom-end'}
          theme="light"
          content={
            <SyntaxHighlighter
              language={lang}
              style={defaultTheme}
              customStyle={{
                borderRadius: '8px',
                margin: '0',
                padding: '0',
                fontSize: 11,
              }}
            >
              {typeToRender}
            </SyntaxHighlighter>
          }
        >
          {`...rest`}
        </Tooltip>
      )}
      {!isSpread &&
        (!disableHighlight ? (
          <SyntaxHighlighter
            language={lang}
            style={defaultTheme}
            customStyle={{
              borderRadius: '8px',
              marginTop: '4px',
              padding: '8px',
              fontFamily: 'roboto mono',
              fontSize: 12,
            }}
          >
            {typeToRender}
          </SyntaxHighlighter>
        ) : (
          inferenceTypeNode.type || inferenceTypeNode.name
        ))}
    </div>
  );
}
