import React from 'react';
import classnames from 'classnames';

import { MenuItem } from '@teambit/design.ui.surfaces.menu.item';
import styles from './command-bar-item.module.scss';

export type CommandItemProps = {
  active?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function CommandBarItem({ className, ...rest }: CommandItemProps) {
  return <MenuItem className={classnames(className, styles.commandBarOption)} {...rest} />;
}
