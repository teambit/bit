import React from 'react';
import { CommandBarItem, CommandBarItemProps } from '../command-bar-item';
import { ComponentModel } from '../../../component/ui';

export type CommandItemProps = {
  component: ComponentModel;
} & CommandBarItemProps;

// TODO highlight match from Fuse

export function ComponentItem({ component, ...rest }: CommandItemProps) {
  return <CommandBarItem {...rest}>{component.id.toString()}</CommandBarItem>;
}
