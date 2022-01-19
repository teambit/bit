import React, { ReactNode, HTMLAttributes } from 'react';
import AnimateHeight from 'react-animate-height';
import { TreeLayer, TreeNodeProps as TreeNodeType } from '../recursive-tree';
import { indentStyle } from '../indent';
import styles from './collapsing-node.module.scss';

export type CollapsingNodeProps = {
  /**
   * The title to be rendered and to be clicked to open the content.
   */
  title: ReactNode;

  /**
   * If the content is open or not.
   */
  isOpen?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, 'title'> &
  TreeNodeType<any>;

export function CollapsingNode({ title, isOpen = false, node, depth, className }: CollapsingNodeProps) {
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
