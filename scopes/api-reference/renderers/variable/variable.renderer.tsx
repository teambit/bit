import React from 'react';
import { VariableLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { defaultCodeEditorOptions } from '@teambit/api-reference.utils.code-editor-options';
import { H5, H6 } from '@teambit/documenter.ui.heading';
import { CodeEditor } from '@teambit/code.monaco.code-editor';
import { Link } from '@teambit/base-react.navigation.link';

import styles from './variable.renderer.module.scss';

export const variableRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === VariableLikeSchema.name,
  Component: VariableComponent,
  nodeType: 'Variables',
  icon: { name: 'Variable', Component: VariableIcon },
  default: true,
};

function VariableComponent({ node, componentId }: APINodeRenderProps) {
  const variableNode = node as VariableLikeSchema;
  const {
    name,
    doc,
    signature,
    location: { filePath, line },
  } = variableNode;
  const comment = doc?.comment;
  const tags = doc?.tags || [];
  const docPath = `${doc?.location.line}:${doc?.location.filePath}`;

  const example = tags.find((tag) => tag.tagName === 'example')?.comment;
  /**
   * @HACK
   * Make Monaco responsive
   * default line height: 18px;
   * base height: 30px;
   * totalHeight: base height + (no of lines * default line height)
   */
  const height = 30 + (example?.split('\n').length || 0) * 18;
  const componentIdUrl = ComponentUrl.toUrl(componentId, { includeVersion: false });
  const locationUrl = `${componentIdUrl}/~code/${filePath}?version=${componentId.version}`;
  const locationLabel = `${filePath}:${line}`;
  const signatureHeight = 30 + (signature.split('\n').length - 1) * 18;

  return (
    <div className={styles.variableComponentContainer}>
      <H5 className={styles.variableName}>{name}</H5>
      {comment && <div className={styles.variableComment}>{comment}</div>}
      <div className={styles.variableSignatureContainer}>
        <CodeEditor options={defaultCodeEditorOptions} value={signature} height={signatureHeight} path={filePath} />
      </div>
      {example && (
        <div className={styles.variableExample}>
          <H6 className={styles.variableExampleTitle}>Example</H6>
          <CodeEditor options={defaultCodeEditorOptions} value={example} path={docPath} height={height} />
        </div>
      )}
      <div className={styles.variableLocation}>
        <Link external={true} href={locationUrl} className={styles.typeLocationLink}>
          {locationLabel}
        </Link>
      </div>
    </div>
  );
}

function VariableIcon() {
  return <></>;
}
