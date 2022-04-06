import React from 'react';
import classnames from 'classnames';

import { MenuItem } from '@teambit/design.ui.surfaces.menu.item';
import { CommanderSearchResult } from '../search-result';
import styles from './command-bar-item.module.scss';

export type CommandItemProps = {
  active?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function CommandBarItem({ className, active, ...rest }: CommandItemProps) {
  return (
    <MenuItem
      {...rest}
      className={classnames(className, styles.commandBarOption)}
      active={active}
    />
  );
}
