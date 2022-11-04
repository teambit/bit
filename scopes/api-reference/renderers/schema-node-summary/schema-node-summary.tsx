import React, { HTMLAttributes } from 'react';
import { ConstructorSchema, DocSchema, Location } from '@teambit/semantics.entities.semantic-schema';
// import Editor from '@monaco-editor/react';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
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
  name,
  doc,
  // location,
  signature,
  isOptional,
  groupElementClassName,
  __schema,
  className,
  ...rest
}: SchemaNodeSummaryProps) {
  const displayName = name || (__schema === ConstructorSchema.name && 'constructor') || undefined;

  const tags = OptionalTag(isOptional);
  const showDocs = doc?.comment || tags.length > 0;

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
        <div key={`node-summary-editor-${signature}-${displayName}`} className={styles.codeEditorContainer}>
          <CodeSnippet>{signature}</CodeSnippet>
        </div>
      )}
    </div>
  );
}

function OptionalTag(isOptional?: boolean): string[] {
  return isOptional ? ['optional'] : [];
}
