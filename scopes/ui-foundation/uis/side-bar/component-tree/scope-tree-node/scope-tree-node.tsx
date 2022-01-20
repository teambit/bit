import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';
import React, { useState, useEffect, useRef } from 'react';
import AnimateHeight from 'react-animate-height';

import { indentClass, indentStyle, TreeNodeProps, TreeLayer, useTree } from '@teambit/design.ui.tree';
import { PayloadType } from '../payload-type';
import { getName } from '../utils/get-name';
import styles from './scope-tree-node.module.scss';

export type ScopeTreeNodeProps = {} & TreeNodeProps<PayloadType>;

export function ScopeTreeNode({ node, depth }: ScopeTreeNodeProps) {
  const { isCollapsed, activePath } = useTree();
  const isActive = activePath?.startsWith(node.id);

  const initialOpen = isActive || !isCollapsed;

  const [open, toggle] = useState<boolean | void>(initialOpen);

  const displayName = getName(node.id.replace(/\/$/, ''));

  const firstRun = useRef(true);
  useEffect(() => {
    const current = firstRun.current;
    if (current) return;
    if (isActive === true) toggle(true);
  }, [isActive]);

  useEffect(() => {
    const current = firstRun.current;
    if (current) return;
    toggle(!isCollapsed);
  }, [isCollapsed]);

  useEffect(() => {
    firstRun.current = false;
  }, []);

  const highlighted = !open && isActive;

  return (
    <div>
      {node.id && (
        <div
          className={classNames(indentClass, styles.scope, highlighted && styles.highlighted)}
          onClick={() => toggle(!open)}
        >
          <div className={styles.left}>
            <Icon className={classNames(styles.arrow, !open && styles.collapsed)} of="fat-arrow-down" />
            <Icon className={styles.arrow} of="collection-full" />
            <span className={styles.name}>{displayName}</span>
          </div>
        </div>
      )}
      <AnimateHeight height={open ? 'auto' : 0}>
        <div style={indentStyle(depth + 1)} className={classNames(styles.componentTree)}>
          {node.children && <TreeLayer childNodes={node.children} depth={depth + 1} />}
        </div>
      </AnimateHeight>
    </div>
  );
}
