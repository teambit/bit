import React from 'react';
import { ClassSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { H5 } from '@teambit/documenter.ui.heading';
import { CopyBox } from '@teambit/documenter.ui.copy-box';

import styles from './class.renderer.module.scss';

export const classRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === ClassSchema.name,
  Component: ClassComponent,
  nodeType: 'Classes',
  icon: { name: 'Class', Component: ClassIcon },
  default: true,
  getName: (node) => {
    const classNode = node as ClassSchema;
    return classNode.name;
  },
};

function ClassComponent({ node }: APINodeRenderProps) {
  const classNode = node as ClassSchema;
  // console.log('🚀 ~ file: class.renderer.tsx ~ line 19 ~ ClassComponent ~ classNode', classNode);
  const { name, doc, extendsNodes, implementNodes, signature } = classNode;
  const classComment = doc?.comment;
  const extendsSignature = extendsNodes?.[0]?.name;
  const implementsDefiniton = implementNodes?.[0]?.name;
  const fullSignature = `${signature} ${extendsSignature || ''} ${implementsDefiniton || ''}`;

  return (
    <div className={styles.classComponentContainer}>
      <H5 className={styles.className}>{name}</H5>
      {classComment && <div className={styles.classComment}>{classComment}</div>}
      <div className={styles.classSignatureContainer}>
        <CopyBox>{fullSignature}</CopyBox>
      </div>
    </div>
  );
}

function ClassIcon() {
  return <></>;
}
