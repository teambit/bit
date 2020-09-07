import React from 'react';
import classnames from 'classnames';
import { CommandBarItem, CommandBarItemProps } from '@teambit/command-bar.command-bar-item';
import { ComponentModel } from '@teambit/component/ui';
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

// @TODO!
function ComponentIcon({ component: any }) {
  throw new Error('not implemented');
  return null;
}
