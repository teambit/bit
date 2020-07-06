import React, { Component } from 'react';
import classNames from 'classnames';
import { NavLink } from 'react-router-dom';
import { TreeNodeProps } from '../recursive-tree';
import { ComponentTreeContext } from '../component-tree-context';
import { indentClass } from '../indent';
import { getName } from '../utils/get-name';
import { clickable } from '../../../../../../to-eject/css-components/clickable';
import { hoverable } from '../../../../../../to-eject/css-components/hoverable';
import styles from './component-view.module.scss';

export class ComponentView extends Component<TreeNodeProps> {
  static contextType = ComponentTreeContext;
  // context!: IComponentTreeContext;

  // handleClick = () => {
  //   const { node } = this.props;
  //   this.context.onSelect(node.id);
  // };

  // private get isSelected() {
  //   const { node } = this.props;
  //   const { selected } = this.context;

  //   return node.id === selected;
  // }

  render() {
    const { node } = this.props;
    // const {status} = this.contextType;

    return (
      <NavLink
        to={`/${node.id}`}
        className={classNames(indentClass, clickable, hoverable, styles.component)}
        activeClassName={styles.active}
      >
        {getName(node.id)}
        {/* <span>M</span> */}
      </NavLink>
    );
  }
}
