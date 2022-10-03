import React from 'react';
import { ClassSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { H5, H6 } from '@teambit/documenter.ui.heading';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { CodeEditor } from '@teambit/code.monaco.code-editor';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { Link } from '@teambit/base-react.navigation.link';
import { SchemaNodeSumary } from '@teambit/api-reference.renderers.schema-node-summary';
import { SchemaNodesIndex } from '@teambit/api-reference.renderers.schema-nodes-index';

import styles from './class.renderer.module.scss';

export const classRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === ClassSchema.name,
  Component: ClassComponent,
  nodeType: 'Classes',
  icon: { name: 'Class', Component: ClassIcon },
  default: true,
};

function ClassComponent({ node, componentId }: APINodeRenderProps) {
  const classNode = node as ClassSchema;
  const {
    name,
    doc,
    extendsNodes,
    implementNodes,
    signature,
    location: { filePath, line },
    members,
  } = classNode;
  const comment = doc?.comment;
  const tags = doc?.tags || [];
  const docPath = `${doc?.location.line}:${doc?.location.filePath}`;

  const example = tags.find((tag) => tag.tagName === 'example')?.comment;
  /**
   * @HACK
   * Make Monaco responsive
   * default line height: 18px;
   * base height: 25px;
   * totalHeight: base height + (no of lines * default line height)
   */
  const height = 30 + (example?.split('\n').length || 0) * 18;
  const extendsSignature = extendsNodes?.[0]?.name;
  const implementsDefiniton = implementNodes?.[0]?.name;
  const fullSignature = `${signature}${(extendsSignature && ' '.concat(extendsSignature)) || ''} ${
    implementsDefiniton || ''
  }`;
  const componentIdUrl = ComponentUrl.toUrl(componentId, { includeVersion: false });
  const locationUrl = `${componentIdUrl}/~code/${filePath}?version=${componentId.version}`;
  const locationLabel = `${filePath}:${line}`;
  const hasMembers = members.length > 0;

  return (
    <div className={styles.classComponentContainer}>
      <H5 className={styles.className}>{name}</H5>
      {comment && <div className={styles.classComment}>{comment}</div>}
      <div className={styles.classSignatureContainer}>
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
          value={fullSignature}
          height={30}
          path={filePath}
        />
      </div>
      {example && (
        <div className={styles.classExample}>
          <H6 className={styles.classExampleTitle}>Example</H6>
          <CodeEditor
            options={{
              minimap: { enabled: false },
              scrollbar: { vertical: 'hidden' },
              scrollBeyondLastLine: false,
              readOnly: true,
            }}
            value={example}
            path={docPath}
            height={height}
          />
        </div>
      )}
      <div className={styles.classLocation}>
        <Link external={true} href={locationUrl} className={styles.classLocationLink}>
          {locationLabel}
        </Link>
      </div>

      {hasMembers && (
        <>
          <SchemaNodesIndex title={'Index'} nodes={members} />
          <div className={styles.classMembersContainer}>
            <H6 className={styles.classMembersTitle}>Members</H6>
            <div className={styles.classMembersDetailsContainer}>
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

function ClassIcon() {
  return <></>;
}
