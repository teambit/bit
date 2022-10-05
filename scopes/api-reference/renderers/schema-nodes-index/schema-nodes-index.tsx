import React, { HTMLAttributes, useState } from 'react';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { SchemaNode, ConstructorSchema } from '@teambit/semantics.entities.semantic-schema';
import classnames from 'classnames';
import {
  groupByNodeSignatureType,
  sortSignatureType,
} from '@teambit/api-reference.utils.group-schema-node-by-signature';

import styles from './schema-nodes-index.module.scss';

export type SchemaNodesIndexProps = {
  nodes: SchemaNode[];
  title?: string;
} & HTMLAttributes<HTMLDivElement>;

export function SchemaNodesIndex({ title, nodes, className }: SchemaNodesIndexProps) {
  const grouped = Array.from(groupByNodeSignatureType(nodes).entries()).sort(sortSignatureType);
  const [drawerOpen, onToggleDrawer] = useState(true);

  return (
    <div className={classnames(styles.schemaNodeIndexContainer, className)}>
      <DrawerUI
        isOpen={drawerOpen}
        onToggle={() => onToggleDrawer((open) => !open)}
        name={title?.toUpperCase()}
        contentClass={styles.schemaNodeDrawerContent}
        className={classnames(styles.schemaNodeIndexDrawer, !drawerOpen && styles.noBorder)}
      >
        {grouped.map(([group, groupedNodes], groupedIndex) => (
          <div
            key={`${group}-${groupedIndex}`}
            className={classnames(styles.group, groupedIndex === 0 && styles.paddingTop)}
          >
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
      </DrawerUI>
    </div>
  );
}
function displayName(node: SchemaNode) {
  if (node.__schema === ConstructorSchema.name) return 'constructor';
  return node.name;
}
