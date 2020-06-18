import React, { Component, useState } from 'react';
import classNames from 'classnames';

import { TreeNodeProps, TreeLayer } from '../recursive-tree';
import { ComponentTreeContext, IComponentTreeContext } from '../component-tree-context';
import { indentStyle, indentClass } from '../indent';
import { getName } from '../utils/get-name';

import { clickable } from '../../../../../../to-eject/css-components/clickable';
import { hoverable } from '../../../../../../to-eject/css-components/hoverable';

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
export function NamespaceView({ node, depth }: TreeNodeProps) {
  const [collapsed, collapse] = useState(false);

  return (
    <div data-collapsed={collapsed}>
      <div className={classNames(indentClass, clickable, styles.namespace)} onClick={() => collapse(!collapsed)}>
        <span className={styles.arrow}>▾</span> {/* WIP */}
        {getName(node.id)}
      </div>

      {!collapsed && (
        <div style={indentStyle(depth + 1)}>
          {node.children && <TreeLayer childNodes={node.children} depth={depth} />}
        </div>
      )}
    </div>
  );
}
export class ComponentView extends Component<TreeNodeProps> {
  static contextType = ComponentTreeContext;
  context!: IComponentTreeContext;

  handleClick = () => {
    const { node } = this.props;
    this.context.onSelect(node.id);
  };

  private get isSelected() {
    const { node } = this.props;
    const { selected } = this.context;

    return node.id === selected;
  }

  render() {
    const { node } = this.props;
    const { isSelected } = this;

    return (
      <div
        className={classNames(indentClass, isSelected && styles.active, clickable, hoverable, styles.component)}
        onClick={this.handleClick}
      >
        {getName(node.id)}
      </div>
    );
  }
}
