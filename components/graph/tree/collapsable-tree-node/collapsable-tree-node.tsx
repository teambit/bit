import React from 'react';
import type { ReactNode, HTMLAttributes } from 'react';
import AnimateHeight from 'react-animate-height';
import { TreeLayer } from '@teambit/base-ui.graph.tree.recursive-tree';
import type { TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import styles from './collapsable-tree-node.module.scss';

export type CollapsableTreeNodeProps = {
  /**
   * The title to be rendered and to be clicked to open the content.
   */
  title: ReactNode;

  /**
   * If the content is open or not.
   */
  isOpen?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, 'title'> &
  TreeNodeProps<any>;

export function CollapsableTreeNode({ title, isOpen = false, node, depth, className }: CollapsableTreeNodeProps) {
  return (
    <div className={className}>
      {title}
      {node.children && (
        <AnimateHeight height={isOpen ? 'auto' : 0}>
          <div className={styles.childrenTree} style={indentStyle(depth + 1)}>
            <TreeLayer childNodes={node.children} depth={depth + 1} />
          </div>
        </AnimateHeight>
      )}
    </div>
  );
}
