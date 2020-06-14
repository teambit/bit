import React, { Component } from 'react';
import classNames from 'classnames';

import { TreeNodeProps, TreeLayer } from '../recursive-tree';
import { ComponentTreeContext, IComponentTreeContext } from '../component-tree-context';
import { indentStyle, indentMargin } from '../indent';
import { getName } from '../utils/get-name';

import styles from './component-nodes.module.scss';

export function ScopeView({ node, depth }: TreeNodeProps) {
  return (
    <>
      <div className={classNames(indentMargin, styles.scope)}>{node.id}</div>

      <div style={indentStyle(depth + 1)}>
        {node.children && <TreeLayer childNodes={node.children} depth={depth} />}
      </div>
    </>
  );
}
export function NamespaceView({ node, depth }: TreeNodeProps) {
  return (
    <>
      <div className={classNames(indentMargin, styles.namespace)}>{getName(node.id)}</div>

      <div style={indentStyle(depth + 1)}>
        {node.children && <TreeLayer childNodes={node.children} depth={depth} />}
      </div>
    </>
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
        className={classNames(indentMargin, isSelected && styles.active, styles.component)}
        onClick={this.handleClick}
      >
        {getName(node.id)}
      </div>
    );
  }
}
