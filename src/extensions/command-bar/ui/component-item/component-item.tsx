import React from 'react';
import classnames from 'classnames';
import { CommandBarItem, CommandBarItemProps } from '../command-bar-item';
import { ComponentModel } from '../../../component/ui';
import { ComponentIcon } from '../../../../components/stage-components/workspace-components/component-icon';
import styles from './component-item.module.scss';

export type CommandItemProps = {
  component: ComponentModel;
} & CommandBarItemProps;

// TODO highlight match from Fuse

export function ComponentItem({ component, className, ...rest }: CommandItemProps) {
  return (
    <CommandBarItem {...rest} className={classnames(className, styles.componentItem)}>
      <ComponentIcon component={component} /> {component.id.toString()}
    </CommandBarItem>
  );
}
