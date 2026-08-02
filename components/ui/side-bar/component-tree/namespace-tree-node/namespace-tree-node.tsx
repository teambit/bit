import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';
import React, { useState } from 'react';
import AnimateHeight from 'react-animate-height';
import { indentClass, indentStyle } from '@teambit/base-ui.graph.tree.indent';
import type { TreeNodeProps } from '@teambit/design.ui.tree';
import { useTree, TreeLayer } from '@teambit/design.ui.tree';
import type { PayloadType } from '../payload-type';
import { getName } from '../utils/get-name';
import styles from './namespace-tree-node.module.scss';

export type NamespaceTreeNodeProps = {} & TreeNodeProps<PayloadType>;

export function NamespaceTreeNode({ node, depth }: NamespaceTreeNodeProps) {
  const { isCollapsed, activePath } = useTree();
  const isActive = activePath?.startsWith(node.id) ?? false;

  const [override, setOverride] = useState<{ isActive: boolean; isCollapsed?: boolean; open: boolean } | null>(null);
  const overrideApplies = override?.isActive === isActive && override?.isCollapsed === isCollapsed;
  const open = overrideApplies ? override!.open : isActive || !isCollapsed;
  const toggleOpen = () => setOverride({ isActive, isCollapsed, open: !open });

  const displayName = getName(node.id.replace(/\/$/, ''));
  const highlighted = !open && isActive;
  return (
    <div>
      {node.id && (
        <div
          className={classNames(indentClass, styles.namespace, highlighted && styles.highlighted)}
          onClick={toggleOpen}
          tabIndex={0}
          role="button"
          onKeyDown={(e) => {
            if (e.key === 'Enter') toggleOpen();
          }}
        >
          <div className={styles.left}>
            <Icon className={classNames(styles.arrow, !open && styles.collapsed)} of="fat-arrow-down" />
            <span className={styles.name}>{displayName}</span>
          </div>
        </div>
      )}
      <AnimateHeight height={open ? 'auto' : 0}>
        <div style={indentStyle(depth + 1)} className={classNames(styles.componentTree)}>
          {node.children && <TreeLayer childNodes={node.children} depth={depth} />}
        </div>
      </AnimateHeight>
    </div>
  );
}
