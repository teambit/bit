import React from 'react';
import { ClassSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { H5 } from '@teambit/documenter.ui.heading';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { CodeEditor } from '@teambit/code.monaco.code-editor';

import styles from './class.renderer.module.scss';

export const classRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === ClassSchema.name,
  Component: ClassComponent,
  nodeType: 'Classes',
  icon: { name: 'Class', Component: ClassIcon },
  default: true,
  getName: (node) => {
    const classNode = node as ClassSchema;
    return classNode.name;
  },
};

function ClassComponent({ node }: APINodeRenderProps) {
  const classNode = node as ClassSchema;
  // console.log('🚀 ~ file: class.renderer.tsx ~ line 19 ~ ClassComponent ~ classNode', classNode);
  const {
    name,
    doc,
    extendsNodes,
    implementNodes,
    signature,
    location: { filePath },
  } = classNode;
  const comment = doc?.comment;
  const tags = doc?.tags || [];

  const example = tags.find((tag) => tag.tagName === 'example')?.comment;
  /**
   * @HACK
   * Make Monaco responsive
   * default line height: 18px;
   * base height: 25px;
   * totalHeight: no of lines * default line height + base height
   */
  const height = (example?.split('\n').length || 0) * 18 + 25;
  const extendsSignature = extendsNodes?.[0]?.name;
  const implementsDefiniton = implementNodes?.[0]?.name;
  const fullSignature = `${signature} ${extendsSignature || ''} ${implementsDefiniton || ''}`;

  return (
    <div className={styles.classComponentContainer}>
      <H5 className={styles.className}>{name}</H5>
      {comment && <div className={styles.classComment}>{comment}</div>}
      <div className={styles.classSignatureContainer}>
        <CopyBox>{fullSignature}</CopyBox>
      </div>
      {example && (
        <div className={styles.classExample} style={{ height: `${height}px` }}>
          <CodeEditor
            options={{ minimap: { enabled: false }, scrollbar: { vertical: 'hidden' }, scrollBeyondLastLine: false }}
            value={example}
            path={filePath}
          />
        </div>
      )}
    </div>
  );
}

function ClassIcon() {
  return <></>;
}
