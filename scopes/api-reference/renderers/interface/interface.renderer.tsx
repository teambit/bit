import React from 'react';
import { InterfaceSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { Link } from '@teambit/base-react.navigation.link';
import { H5, H6 } from '@teambit/documenter.ui.heading';
import { CodeEditor } from '@teambit/code.monaco.code-editor';
import { defaultCodeEditorOptions } from '@teambit/api-reference.utils.code-editor-options';
import { SchemaNodesIndex } from '@teambit/api-reference.renderers.schema-nodes-index';
import { SchemaNodeSumary } from '@teambit/api-reference.renderers.schema-node-summary';

import styles from './interface.renderer.module.scss';

export const interfaceRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === InterfaceSchema.name,
  Component: InterfaceComponent,
  nodeType: 'Interfaces',
  icon: { name: 'Interface', Component: InterfaceIcon },
  default: true,
};

function InterfaceComponent({ node, componentId }: APINodeRenderProps) {
  const interfaceNode = node as InterfaceSchema;
  const {
    name,
    doc,
    extendsNodes,
    signature,
    location: { filePath, line },
    members,
  } = interfaceNode;
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
  const fullSignature = `${signature}${(extendsSignature && ' '.concat(extendsSignature)) || ''}`;
  const componentIdUrl = ComponentUrl.toUrl(componentId, { includeVersion: false });
  const locationUrl = `${componentIdUrl}/~code/${filePath}?version=${componentId.version}`;
  const locationLabel = `${filePath}:${line}`;
  const hasMembers = members.length > 0;

  return (
    <div className={styles.interfaceComponentContainer}>
      <H5 className={styles.interfaceName}>{name}</H5>
      {comment && <div className={styles.interfaceComment}>{comment}</div>}
      <div className={styles.interfaceSignatureContainer}>
        <CodeEditor options={defaultCodeEditorOptions} value={fullSignature} height={30} path={filePath} />
      </div>
      {example && (
        <div className={styles.interfaceExample}>
          <H6 className={styles.interfaceExampleTitle}>Example</H6>
          <CodeEditor options={defaultCodeEditorOptions} value={example} path={docPath} height={height} />
        </div>
      )}
      <div className={styles.interfaceLocation}>
        <Link external={true} href={locationUrl} className={styles.interfaceLocationLink}>
          {locationLabel}
        </Link>
      </div>

      {hasMembers && (
        <>
          <SchemaNodesIndex title={'Index'} nodes={members} />
          <div className={styles.interfaceMembersContainer}>
            <H6 className={styles.interfaceMembersTitle}>Members</H6>
            <div className={styles.interfaceMembersDetailsContainer}>
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

function InterfaceIcon() {
  return <></>;
}
