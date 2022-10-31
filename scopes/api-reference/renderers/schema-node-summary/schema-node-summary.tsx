import React, { HTMLAttributes, useState, useRef, useEffect } from 'react';
import { ConstructorSchema, DocSchema, Location } from '@teambit/semantics.entities.semantic-schema';
import Editor from '@monaco-editor/react';
import { defaultCodeEditorOptions } from '@teambit/api-reference.utils.code-editor-options';
import classnames from 'classnames';

import styles from './schema-node-summary.module.scss';

export const trackedElementClassName = 'tracked-element';

export type SchemaNodeSummaryProps = {
  signature?: string;
  __schema: string;
  location: Location;
  isOptional?: boolean;
  doc?: DocSchema;
  name?: string;
  groupElementClassName?: string;
} & HTMLAttributes<HTMLDivElement>;

/**
 * @todo handle doc.tags
 */
export function SchemaNodeSummary({
  signature,
  name,
  doc,
  location,
  isOptional,
  groupElementClassName,
  __schema,
  className,
  ...rest
}: SchemaNodeSummaryProps) {
  const editorRef = useRef<any>();
  const monacoRef = useRef<any>();

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
  const tags = OptionalTag(isOptional);
  const showDocs = doc?.comment || tags.length > 0;

  useEffect(() => {
    if (!editorRef.current) return;
    const signatureContent = editorRef.current.getValue();
    if (!signatureContent) {
      setSignatureHeight(defaultSignatureHeight);
    } else {
      const updatedSignatureHeight = 36 + (signatureContent?.split('\n').length || 0) * 18;
      setSignatureHeight(updatedSignatureHeight);
    }
  }, [editorRef.current]);

  useEffect(() => {
    if (isMounted) {
      monacoRef.current.languages.typescript.typescriptDefaults.setCompilerOptions({
        jsx: monacoRef.current.languages.typescript.JsxEmit.Preserve,
        target: monacoRef.current.languages.typescript.ScriptTarget.ES2020,
        esModuleInterop: true,
      });
      monacoRef.current.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
      });
      const container = editorRef.current.getDomNode();
      editorRef.current.onDidContentSizeChange(({ contentHeight }) => {
        if (container && isMounted && displaySignature) {
          const updatedHeight = Math.min(200, contentHeight + 18);
          setSignatureHeight(updatedHeight);
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
    <div {...rest} className={classnames(styles.schemaNodeSummary, className)}>
      {displayName && (
        <div
          id={displayName}
          className={classnames(styles.schemaNodeSummaryName, trackedElementClassName, groupElementClassName)}
        >
          {displayName}
        </div>
      )}
      {showDocs && (
        <div className={classnames(styles.schemaNodeDoc)}>
          {
            <div className={classnames(styles.docComment, !doc?.comment && styles.placeholderComment)}>
              {doc?.comment || 'add comment using JSDoc'}
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
          <Editor
            key={`node-summary-editor-${signature}`}
            options={defaultCodeEditorOptions}
            value={displaySignature}
            height={signatureHeight}
            path={path}
            className={styles.editor}
            beforeMount={(monaco) => {
              monacoRef.current = monaco;
            }}
            onMount={(editor) => {
              editorRef.current = editor;
              setIsMounted(true);
            }}
            theme={'vs-dark'}
          />
        </div>
      )}
    </div>
  );
}

function OptionalTag(isOptional?: boolean): string[] {
  return isOptional ? ['optional'] : [];
}
