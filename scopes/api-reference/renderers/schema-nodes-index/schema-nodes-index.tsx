import React, { HTMLAttributes, useEffect, useRef } from 'react';
import { useElementOnFold } from '@teambit/docs.ui.hooks.use-element-on-fold';
import { SchemaNode, ConstructorSchema } from '@teambit/semantics.entities.semantic-schema';
import classnames from 'classnames';
import { classes } from '@teambit/design.ui.surfaces.menu.item';
import {
  groupByNodeSignatureType,
  sortSignatureType,
} from '@teambit/api-reference.utils.group-schema-node-by-signature';
import flatten from 'lodash.flatten';
import { trackedElementClassName } from '@teambit/api-reference.renderers.schema-node-summary';
import { useLocation, Link } from '@teambit/base-react.navigation.link';

import styles from './schema-nodes-index.module.scss';

export type SchemaNodesIndexProps = {
  nodes: SchemaNode[];
  title?: string;
  /**
   * the ref of the parent element. fallback is document.
   */
  rootRef?: React.MutableRefObject<HTMLElement>;
} & HTMLAttributes<HTMLDivElement>;

export function SchemaNodesIndex({ rootRef, title, nodes, className }: SchemaNodesIndexProps) {
  const grouped = Array.from(groupByNodeSignatureType(nodes).entries()).sort(sortSignatureType);
  const hasGroupedElements = flatten(grouped).length > 0;
  const { elements } = useElementOnFold(rootRef, `.${trackedElementClassName}`);
  const loadedRef = useRef(false);
  const currentLocation = useLocation();
  const hash = currentLocation?.hash.slice(1);

  // scroll to active link, after first load and after content is loaded
  useEffect(() => {
    if (elements.length === 0) return;
    if (loadedRef.current) return;
    loadedRef.current = true;

    const _hash = currentLocation?.hash.slice(1);
    if (!_hash) return;

    const matchingElement = elements.find((el) => el.id === _hash);
    if (matchingElement) matchingElement.scrollIntoView();
  }, [elements, elements.length]);

  if (!hasGroupedElements) return null;

  return (
    <div className={classnames(styles.schemaNodeIndexContainer, className)}>
      <div className={styles.title}>{title}</div>
      {grouped.map(([group, groupedNodes], groupedIndex) => (
        <div
          key={`${group}-${groupedIndex}`}
          className={classnames(styles.group, groupedIndex === 0 && styles.paddingTop)}
        >
          <div className={styles.groupName}>
            <Link
              native
              href={`#${group}`}
              className={classnames(
                styles.groupedNodeName,
                classes.menuItem,
                classes.interactive,
                hash === group && classes.active
              )}
            >
              {group}
            </Link>
          </div>
          <div className={styles.groupedNodesContainer}>
            {groupedNodes.map((node, nodeIndex) => {
              const nodeDisplayName = displayName(node);
              const isActive = nodeDisplayName === hash;

              return (
                <div key={`${nodeDisplayName}-${nodeIndex}`} className={styles.groupedNode}>
                  <Link
                    native
                    href={`#${nodeDisplayName}`}
                    className={classnames(
                      styles.groupedNodeName,
                      classes.menuItem,
                      classes.interactive,
                      isActive && classes.active
                    )}
                  >
                    {nodeDisplayName}
                  </Link>
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
