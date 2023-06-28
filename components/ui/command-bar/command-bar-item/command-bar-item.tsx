import React from 'react';
import classnames from 'classnames';

import { MenuItem, MenuItemsProps } from '@teambit/design.ui.surfaces.menu.item';
import styles from './command-bar-item.module.scss';

export type CommandItemProps = {
  active?: boolean;
} & MenuItemsProps;

export function CommandBarItem({ className, ...rest }: CommandItemProps) {
  return <MenuItem className={classnames(className, styles.commandBarOption)} {...rest} />;
}
