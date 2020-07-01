import React from 'react';
import classNames from 'classnames';
import { TreeNodeProps, TreeLayer } from '../recursive-tree';
import { indentStyle, indentClass } from '../indent';
import styles from './component-nodes.module.scss';

export function ScopeView({ node, depth }: TreeNodeProps) {
  return (
    <>
      <div className={classNames(indentClass, styles.scope)}>{node.id}</div>

      <div style={indentStyle(depth + 1)}>
        {node.children && <TreeLayer childNodes={node.children} depth={depth} />}
      </div>
    </>
  );
}
