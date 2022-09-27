import React from 'react';
import { ClassSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { H4, H6 } from '@teambit/documenter.ui.heading';

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
  const { name, doc } = classNode;
  const classComment = doc?.comment;

  return (
    <div className={styles.classComponentContainer}>
      <H4>{name}</H4>
      <div className={styles.classComment}>{classComment}</div>
      <div className={styles.classDefinitionContainer}>
        <H6>Definiton</H6>
        <div className={styles.classDefintion}></div>
      </div>
    </div>
  );
}

function ClassIcon() {
  return <></>;
}
