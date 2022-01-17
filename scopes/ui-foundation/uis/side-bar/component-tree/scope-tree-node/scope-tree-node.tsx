import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';
import React, { useState, useEffect, useRef } from 'react';
import AnimateHeight from 'react-animate-height';

import { indentClass, indentStyle, TreeNodeProps, TreeLayer, useTree } from '@teambit/design.ui.tree';
import { PayloadType } from '../payload-type';
import { getName } from '../utils/get-name';
import styles from './scope-tree-node.module.scss';

export type ScopeTreeNodeProps = {
  isActive?: boolean;
  isOpen?: boolean;
} & TreeNodeProps<PayloadType>;

export function ScopeTreeNode({ node, depth }: ScopeTreeNodeProps) {
  const { isCollapsed, activePath } = useTree();
  const isActive = activePath?.startsWith(node.id);

  const initialOpen = isActive || !isCollapsed;
  // rename to open
  const [collapsed, collapse] = useState<boolean | void>(!initialOpen);

  const displayName = getName(node.id.replace(/\/$/, ''));

  const firstRun = useRef(true);
  useEffect(() => {
    const current = firstRun.current;
    if (current) return;
    if (isActive === true) return collapse(false);
  }, [isActive]);

  useEffect(() => {
    const current = firstRun.current;
    if (current) return;
    collapse(isCollapsed);
  }, [isCollapsed]);

  useEffect(() => {
    firstRun.current = false;
  }, []);

  const highlighted = collapsed && isActive;

  return (
    <div>
      {node.id && (
        <div
          className={classNames(indentClass, styles.scope, highlighted && styles.highlighted)}
          onClick={() => collapse(!collapsed)}
        >
          <div className={styles.left}>
            <Icon className={classNames(styles.arrow, collapsed && styles.collapsed)} of="fat-arrow-down" />
            <Icon className={styles.arrow} of="collection-full" />
            <span className={styles.name}>{displayName}</span>
          </div>
        </div>
      )}
      <AnimateHeight height={collapsed ? 0 : 'auto'}>
        <div style={indentStyle(depth + 1)} className={classNames(styles.componentTree)}>
          {node.children && <TreeLayer childNodes={node.children} depth={depth + 1} />}
        </div>
      </AnimateHeight>
    </div>
  );
}
