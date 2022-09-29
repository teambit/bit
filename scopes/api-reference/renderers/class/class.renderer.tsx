import React, { HTMLAttributes } from 'react';
import { ClassSchema, ConstructorSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { H5, H6 } from '@teambit/documenter.ui.heading';
import { CopyBox } from '@teambit/documenter.ui.copy-box';
import { CodeEditor } from '@teambit/code.monaco.code-editor';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { Link } from '@teambit/base-react.navigation.link';

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
    location: { filePath, line, character },
    members,
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
  const fullSignature = `${signature}${(extendsSignature && ' '.concat(extendsSignature)) || ''} ${
    implementsDefiniton || ''
  }`;
  const componentIdUrl = ComponentUrl.toUrl(componentId, { includeVersion: false });
  const locationUrl = `${componentIdUrl}/~code/${filePath.split('.')[0]}?version=${componentId.version}`;
  const locationLabel = `${filePath}:${line}:${character}`;
  const hasMembers = members.length > 0;

  return (
    <div className={styles.classComponentContainer}>
      <H5 className={styles.className}>{name}</H5>
      {comment && <div className={styles.classComment}>{comment}</div>}
      <div className={styles.classSignatureContainer}>
        <CopyBox>{fullSignature}</CopyBox>
      </div>
      {example && (
        <div className={styles.classExample}>
          <H6 className={styles.classExampleTitle}>Example</H6>
          <CodeEditor
            options={{ minimap: { enabled: false }, scrollbar: { vertical: 'hidden' }, scrollBeyondLastLine: false }}
            value={example}
            path={filePath}
            height={`${height}px`}
          />
        </div>
      )}
      <div className={styles.classLocation}>
        <Link href={locationUrl} className={styles.classLocationLink}>
          {locationLabel}
        </Link>
      </div>
      {hasMembers && (
        <div className={styles.classMembersContainer}>
          <H6 className={styles.classMembersTitle}>Members</H6>
          <div className={styles.classMembersDetailsContainer}>
            {members.map((member, index) => (
              <ClassMember key={index} member={member} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type ClassMemberProps = { member: SchemaNode } & HTMLAttributes<HTMLDivElement>;
function ClassMember({ member }: ClassMemberProps) {
  const { signature, name, __schema } = member;
  const displayName = name || (__schema === ConstructorSchema.name && 'constructor') || undefined;
  const signatureLength = signature?.split('\n').length || 0;
  const signatureHeight = 40 + (signatureLength - 1) * 14;
  return (
    <div className={styles.classMember}>
      {displayName && <div className={styles.classMemberName}>{displayName}</div>}
      {signature && (
        <CopyBox className={styles.classMemberSignature} style={{ height: signatureHeight }}>
          {signature}
        </CopyBox>
      )}
    </div>
  );
}

function ClassIcon() {
  return <></>;
}
