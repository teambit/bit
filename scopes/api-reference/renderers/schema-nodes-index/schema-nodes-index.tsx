import React, { HTMLAttributes, useEffect, useRef, useMemo } from 'react';
import { useElementOnFold } from '@teambit/docs.ui.hooks.use-element-on-fold';
import classnames from 'classnames';
import { classes } from '@teambit/design.ui.surfaces.menu.item';
import flatten from 'lodash.flatten';
import { trackedElementClassName } from '@teambit/api-reference.renderers.schema-node-member-summary';
import { useLocation, Link } from '@teambit/base-react.navigation.link';

import styles from './schema-nodes-index.module.scss';

export type SchemaNodesIndexProps = {
  title?: string;
  /**
   * the ref of the parent element. fallback is document.
   */
  rootRef?: React.MutableRefObject<HTMLElement>;
} & HTMLAttributes<HTMLDivElement>;

export function SchemaNodesIndex({ rootRef, title, className, ...rest }: SchemaNodesIndexProps) {
  const { elements } = useElementOnFold(rootRef, `.${trackedElementClassName}`);
  const loadedRef = useRef(false);
  const currentLocation = useLocation();
  const hash = currentLocation?.hash && decodeURIComponent(currentLocation.hash.slice(1));
  const grouped = useMemo(() => Array.from(groupElements(elements).entries()), [elements, elements.length]);
  const hasGroupedElements = flatten(grouped).length > 0;
  // scroll to active link, after first load and after content is loaded
  useEffect(() => {
    if (elements.length === 0) return;
    if (loadedRef.current) return;
    loadedRef.current = true;

    const _hash = currentLocation?.hash.slice(1);
    if (!_hash) return;

    const matchingElement = elements.find((el) => el.id === decodeURIComponent(_hash));

    if (matchingElement) matchingElement.scrollIntoView();
  }, [elements, elements.length]);

  if (!hasGroupedElements) return null;

  return (
    <div {...rest} className={classnames(styles.schemaNodeIndexContainer, className)}>
      <div className={styles.title}>{title}</div>
      {grouped.map(([group, groupedNodes], groupedIndex) => {
        if (!group) {
          return (
            <div key={`group-${groupedIndex}`} className={classnames(styles.groupedNodesContainer, styles.paddingTop)}>
              {groupedNodes.map((node, nodeIndex) => {
                const isActive = node && decodeURIComponent(node) === hash;
                return (
                  <div key={`${node}-${nodeIndex}`} className={classnames(styles.groupedNode, styles.noGroup)}>
                    <Link
                      native
                      href={`#${node}`}
                      className={classnames(
                        styles.groupedNodeName,
                        classes.menuItem,
                        classes.interactive,
                        isActive && classes.active
                      )}
                    >
                      {node}
                    </Link>
                  </div>
                );
              })}
            </div>
          );
        }
        return (
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
                  hash === decodeURIComponent(group) && classes.active
                )}
              >
                {decodeURIComponent(group)}
              </Link>
            </div>
            <div className={styles.groupedNodesContainer}>
              {groupedNodes.map((node, nodeIndex) => {
                const isActive = node && decodeURIComponent(node) === hash;

                return (
                  <div key={`${node}-${nodeIndex}`} className={styles.groupedNode}>
                    <Link
                      native
                      href={`#${node}`}
                      className={classnames(
                        styles.groupedNodeName,
                        classes.menuItem,
                        classes.interactive,
                        isActive && classes.active
                      )}
                    >
                      {node}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function groupElements(elements: Element[]) {
  const grouped = new Map<string | null, (string | null)[]>();

  let groupedElementId: string | null = null;

  for (let i = 0; i <= elements.length - 1; i += 1) {
    const curr = elements[i];
    const next = elements[i + 1];
    const currDisplayId = curr.id;
    // if the next element contains current elements id as class; start a new group
    if (next && next.classList.contains(currDisplayId)) {
      const groupId = currDisplayId;
      groupedElementId = groupId;
      grouped.set(groupedElementId, [next.textContent]);
      i += 1;
    }

    // if no groupedElementId; add it to no group
    if (!groupedElementId) {
      const existing = grouped.get(null) || [];
      grouped.set(null, existing.concat([curr.textContent]));
    }

    // if it is not a group node and groupElementId exists, add it to existing group
    if (groupedElementId && currDisplayId !== groupedElementId) {
      const existing = grouped.get(groupedElementId) || [];
      grouped.set(groupedElementId, existing.concat(curr.textContent));
    }
  }

  return grouped;
}
