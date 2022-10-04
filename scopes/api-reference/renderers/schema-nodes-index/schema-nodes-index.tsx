import React, { HTMLAttributes } from 'react';
import { SchemaNode, ConstructorSchema } from '@teambit/semantics.entities.semantic-schema';
import classnames from 'classnames';
import pluralize from 'pluralize';

import styles from './schema-nodes-index.module.scss';

export type SchemaNodesIndexProps = {
  nodes: SchemaNode[];
  title?: string;
} & HTMLAttributes<HTMLDivElement>;

export function SchemaNodesIndex({ title, nodes, className }: SchemaNodesIndexProps) {
  const grouped = Array.from(groupByNodeSignatureType(nodes).entries()).sort(sortSignatureType);

  return (
    <div className={classnames(styles.schemaNodeIndexContainer, className)}>
      {title && <div className={styles.title}>{title}</div>}
      {grouped.map(([group, groupedNodes], groupedIndex) => (
        <div key={`${group}-${groupedIndex}`} className={styles.group}>
          <div className={styles.groupName}>{group}</div>
          <div className={styles.groupedNodesContainer}>
            {groupedNodes.map((node, nodeIndex) => {
              const nodeDisplayName = displayName(node);
              return (
                <div key={`${nodeDisplayName}-${nodeIndex}`} className={styles.groupedNode}>
                  <div className={styles.groupedNodeIcon}></div>
                  <a href={`#${nodeDisplayName}`} className={styles.groupedNodeName}>
                    {nodeDisplayName}
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
function displayName(node: SchemaNode) {
  if (node.__schema === ConstructorSchema.name) return 'constructor';
  return node.name;
}

function sortSignatureType([aType]: [string, SchemaNode[]], [bType]: [string, SchemaNode[]]): 0 | 1 | -1 {
  if (aType < bType) return -1;
  if (aType > bType) return 1;
  return 0;
}
function groupByNodeSignatureType(nodes: SchemaNode[]): Map<string, SchemaNode[]> {
  return nodes.reduce((accum, next) => {
    const { signature, __schema } = next;
    if (!signature) return accum;
    const type =
      __schema === ConstructorSchema.name
        ? pluralize('constructor')
        : pluralize(signature.split(') ')[0].split('(')[1] || '');
    const existing = accum.get(type) || [];
    accum.set(type, existing.concat(next));
    return accum;
  }, new Map<string, SchemaNode[]>());
}
