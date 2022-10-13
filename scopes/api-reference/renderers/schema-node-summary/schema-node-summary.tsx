import React, { HTMLAttributes, useState, useRef, useEffect } from 'react';
import {
  ConstructorSchema,
  ParameterSchema,
  SchemaNode,
  VariableLikeSchema,
} from '@teambit/semantics.entities.semantic-schema';
import { CodeEditor } from '@teambit/code.monaco.code-editor';
import { defaultCodeEditorOptions } from '@teambit/api-reference.utils.code-editor-options';
import classnames from 'classnames';

import styles from './schema-node-summary.module.scss';

export type SchemaNodeSummaryProps = {
  node: SchemaNode;
} & HTMLAttributes<HTMLDivElement>;

export function SchemaNodeSummary({ node }: SchemaNodeSummaryProps) {
  const editorRef = useRef<any>();

  const { signature, name, __schema, doc, location } = node;
  const displayName = name || (__schema === ConstructorSchema.name && 'constructor') || undefined;
  const signatureLength = signature?.split('\n').length || 0;
  const defaultSignatureHeight = 36 + (signatureLength - 1) * 18;

  const [signatureHeight, setSignatureHeight] = useState<number>(defaultSignatureHeight);
  const [isMounted, setIsMounted] = useState(false);

  // Remove node type from the signature. i.e (method), (getter), (setter), (property)
  let displaySignature: string | undefined;
  if (!signature) displaySignature = undefined;
  else if (__schema === ConstructorSchema.name && 'constructor') displaySignature = signature;
  else {
    const displaySignatureIndex = signature.indexOf(') ') + 1;
    displaySignature = signature?.slice(displaySignatureIndex).trim();
  }
  // Monaco requires a unique path that ends with the file extension
  const path = `${location.line}:${location.character}:${location.filePath}`;
  const tags = getTags(node);
  const showDocs = doc?.comment || tags.length > 0;

  useEffect(() => {
    if (isMounted) {
      const container = editorRef.current.getDomNode();
      editorRef.current.onDidContentSizeChange(() => {
        if (container && isMounted) {
          const contentHeight = Math.min(1000, editorRef.current.getContentHeight() + 18);
          setSignatureHeight(contentHeight);
        }
      });
    }
  }, [isMounted]);

  useEffect(() => {
    return () => {
      setIsMounted(false);
    };
  }, []);

  return (
    <div className={styles.schemaNodeSummary}>
      {displayName && (
        <div id={displayName} className={styles.schemaNodeSummaryName}>
          {displayName}
        </div>
      )}
      {showDocs && (
        <div className={classnames(styles.schemaNodeDoc)}>
          {
            <div className={classnames(styles.docComment, !doc?.comment && styles.placeholderComment)}>
              {doc?.comment || 'add comment using @jsdoc'}
            </div>
          }
          {tags?.length > 0 && (
            <div className={styles.docTags}>
              {tags.map((tag) => (
                <div key={tag} className={styles.tag}>
                  {tag}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {signature && (
        <div className={styles.codeEditorContainer}>
          <CodeEditor
            options={defaultCodeEditorOptions}
            value={displaySignature}
            height={signatureHeight}
            path={path}
            onMount={(editor) => {
              editorRef.current = editor;
              setIsMounted(true);
            }}
          />
        </div>
      )}
    </div>
  );
}

function getTags(node: SchemaNode): string[] {
  /**
   * @todo handle node.doc.tags
   */
  if (!(node.__schema === VariableLikeSchema.name || node.__schema === ParameterSchema.name)) return [];
  const typedNode = node as VariableLikeSchema | ParameterSchema;
  return typedNode.isOptional ? ['optional'] : [];
}
