import React, { HTMLAttributes } from 'react';
import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { H5, H6 } from '@teambit/documenter.ui.heading';
import { CodeEditor } from '@teambit/code.monaco.code-editor';
import { Link } from '@teambit/base-react.navigation.link';
import { SchemaNodeSummary } from '@teambit/api-reference.renderers.schema-node-summary';
import { SchemaNodesIndex } from '@teambit/api-reference.renderers.schema-nodes-index';
import { defaultCodeEditorOptions } from '@teambit/api-reference.utils.code-editor-options';
import classnames from 'classnames';
import {
  groupByNodeSignatureType,
  sortSignatureType,
} from '@teambit/api-reference.utils.group-schema-node-by-signature';

import styles from './schema-node-details.module.scss';

export type SchemaNodeDetailsProps = {
  name: string;
  signature?: string;
  example?: { content: string; path: string };
  members?: SchemaNode[];
  comment?: string;
  location: { url: string; label: string; path: string };
} & HTMLAttributes<HTMLDivElement>;

export function SchemaNodeDetails({
  name,
  signature,
  example,
  members,
  comment,
  location,
  children,
}: SchemaNodeDetailsProps) {
  /**
   * @HACK
   * Make Monaco responsive
   * default line height: 18px;
   * totalHeight: (no of lines * default line height)
   */
  const exampleHeight = (example?.content.split('\n').length || 0) * 18;
  const signatureHeight = 36 + ((signature?.split('\n').length || 0) - 1) * 18;
  const locationUrl = location.url;
  const locationLabel = location.label;
  const hasMembers = members && members.length > 0;
  const filePath = location.path;
  const groupedMembers = members ? Array.from(groupByNodeSignatureType(members).entries()).sort(sortSignatureType) : [];

  return (
    <div className={styles.schemaNodeDetailsContainer}>
      <H5 className={styles.schemaNodeDetailsName}>{name}</H5>
      {comment && <div className={styles.schemaNodeDetailsComment}>{comment}</div>}
      {signature && (
        <div className={classnames(styles.schemaNodeDetailsSignatureContainer, styles.codeEditorContainer)}>
          <CodeEditor options={defaultCodeEditorOptions} value={signature} height={signatureHeight} path={filePath} />
        </div>
      )}
      {example && (
        <div className={styles.schemaNodeDetailsExample}>
          <H6 className={styles.schemaNodeDetailsExampleTitle}>Example</H6>
          <div className={styles.codeEditorContainer}>
            <CodeEditor
              options={defaultCodeEditorOptions}
              value={example.content}
              path={example.path}
              height={exampleHeight}
            />
          </div>
        </div>
      )}
      <div className={styles.schemaNodeDetailsLocation}>
        <Link external={true} href={locationUrl} className={styles.schemaNodeDetailsLocationLink}>
          {locationLabel}
        </Link>
      </div>
      {hasMembers && (
        <>
          <SchemaNodesIndex title={'Index'} nodes={members} />
          <div className={styles.schemaNodeDetailsMembersContainer}>
            {groupedMembers.map(([type, groupedMembersByType]) => {
              return (
                <div key={`${type}`} className={styles.groupedMemberContainer}>
                  <div className={styles.groupName}>{type}</div>
                  {groupedMembersByType.map((member) => (
                    <SchemaNodeSummary key={`${type}-${member.__schema}-${member.name}`} node={member} />
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
      {children}
    </div>
  );
}
