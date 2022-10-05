import React, { HTMLAttributes } from 'react';
import { ConstructorSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { CodeEditor } from '@teambit/code.monaco.code-editor';
import { defaultCodeEditorOptions } from '@teambit/api-reference.utils.code-editor-options';

import styles from './schema-node-summary.module.scss';

export type SchemaNodeSummaryProps = { node: SchemaNode } & HTMLAttributes<HTMLDivElement>;
/**
 * @todo
 * find a better way to render all doc tags
 */
export function SchemaNodeSummary({ node }: SchemaNodeSummaryProps) {
  const { signature, name, __schema, doc, location } = node;
  const displayName = name || (__schema === ConstructorSchema.name && 'constructor') || undefined;
  const signatureLength = signature?.split('\n').length || 0;
  const signatureHeight = 30 + (signatureLength - 1) * 18;
  // Remove node type from the signature. i.e (method), (getter), (setter), (property)
  const displaySignature = __schema === ConstructorSchema.name && 'constructor' ? signature : signature?.split(') ')[1];
  // Monaco requires a unique path that ends with the file extension
  const path = `${location.line}:${location.filePath}`;
  return (
    <div className={styles.schemaNodeSummary}>
      {displayName && (
        <div id={displayName} className={styles.schemaNodeSummaryName}>
          {displayName}
        </div>
      )}
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
        <CodeEditor options={defaultCodeEditorOptions} value={displaySignature} height={signatureHeight} path={path} />
      )}
    </div>
  );
}
