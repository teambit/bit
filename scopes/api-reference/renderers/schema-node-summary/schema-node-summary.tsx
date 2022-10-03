import React, { HTMLAttributes } from 'react';
import { ConstructorSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { CodeEditor } from '@teambit/code.monaco.code-editor';
// import { CopyBox } from '@teambit/documenter.ui.copy-box';

import styles from './schema-node-summary.module.scss';

export type SchemaNodeSummaryProps = { node: SchemaNode } & HTMLAttributes<HTMLDivElement>;

export function SchemaNodeSumary({ node }: SchemaNodeSummaryProps) {
  const { signature, name, __schema, doc, location } = node;
  const displayName = name || (__schema === ConstructorSchema.name && 'constructor') || undefined;
  const signatureLength = signature?.split('\n').length || 0;
  const signatureHeight = 30 + (signatureLength - 1) * 18;
  // Remove node type from the signature. i.e (method), (getter), (setter), (property)
  const displaySignature = __schema === ConstructorSchema.name && 'constructor' ? signature : signature?.split(') ')[1];
  // Monaco requires a unique path that ends with the file extension
  const path = `${location.line}:${location.character}:${location.filePath}`;
  return (
    <div className={styles.schemaNodeSummary}>
      {displayName && <div className={styles.schemaNodeSummaryName}>{displayName}</div>}
      {doc && (
        <div className={styles.schemaNodeDoc}>
          {doc.comment && <div className={styles.docComment}>{doc.comment}</div>}
          {/* {doc.tags && doc.tags.length > 0 && (
            <div className={styles.docTags}>
              {doc.tags.map((tag, index) => (
                <div key={index} className={styles.docTag}>
                  {tag.tagName}
                </div>
              ))}
            </div>
          )} */}
        </div>
      )}
      {signature && (
        // <CopyBox className={styles.schemaNodeSummarySignature} style={{ height: signatureHeight }}>
        //   {signature}
        // </CopyBox>
        <CodeEditor
          options={{
            minimap: { enabled: false },
            scrollbar: { vertical: 'hidden' },
            scrollBeyondLastLine: false,
            readOnly: true,
            language: 'typescript',
            lineNumbers: 'off',
            folding: false,
          }}
          value={displaySignature}
          height={signatureHeight}
          path={path}
        />
      )}
    </div>
  );
}
