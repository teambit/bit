import React from 'react';
import { TypeLiteralSchema, TypeSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { H5, H6 } from '@teambit/documenter.ui.heading';
import { CodeEditor } from '@teambit/code.monaco.code-editor';
import { defaultCodeEditorOptions } from '@teambit/api-reference.utils.code-editor-options';
import { Link } from '@teambit/base-react.navigation.link';
import { SchemaNodesIndex } from '@teambit/api-reference.renderers.schema-nodes-index';
import { SchemaNodeSumary } from '@teambit/api-reference.renderers.schema-node-summary';

import styles from './type.renderer.module.scss';

export const typeRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeSchema.name,
  Component: TypeComponent,
  nodeType: 'Types',
  icon: { name: 'Type', Component: TypeIcon },
  default: true,
};

function TypeComponent({ node, componentId }: APINodeRenderProps) {
  const typeNode = node as TypeSchema;
  const {
    name,
    doc,
    signature,
    location: { filePath, line },
    type,
  } = typeNode;
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
  const hasMembers = type.__schema === TypeLiteralSchema.name;
  const members = hasMembers ? (type as TypeLiteralSchema).members : [];
  return (
    <div className={styles.typeComponentContainer}>
      <H5 className={styles.typeName}>{name}</H5>
      {comment && <div className={styles.typeComment}>{comment}</div>}
      <div className={styles.typeSignatureContainer}>
        <CodeEditor options={defaultCodeEditorOptions} value={signature} height={signatureHeight} path={filePath} />
      </div>
      {example && (
        <div className={styles.typeExample}>
          <H6 className={styles.typeExampleTitle}>Example</H6>
          <CodeEditor options={defaultCodeEditorOptions} value={example} path={docPath} height={height} />
        </div>
      )}
      <div className={styles.typeLocation}>
        <Link external={true} href={locationUrl} className={styles.typeLocationLink}>
          {locationLabel}
        </Link>
      </div>
      {hasMembers && (
        <>
          <SchemaNodesIndex title={'Index'} nodes={members} />
          <div className={styles.typeMembersContainer}>
            <H6 className={styles.typeMembersTitle}>Members</H6>
            <div className={styles.typeMembersDetailsContainer}>
              {members.map((member, index) => (
                <SchemaNodeSumary key={index} node={member} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TypeIcon() {
  return <></>;
}
