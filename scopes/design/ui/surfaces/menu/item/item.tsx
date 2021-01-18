import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';

import styles from './item.module.scss';

export const classes = {
  menuItem: styles.menuItem,
  interactive: styles.interactive,
  active: styles.active,
  icon: styles.icon,
}; 
export interface MenuItemsProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Optional icon to render at the start of the item (icomoon id) */
  icon?: string;
  /** apply active styles */
  active?: boolean;
  /** highlight when user hovers over item */
  interactive?: boolean;
}

/**
 * Menu entry with icon.
 */
export function MenuItem({ children, className, icon, active, interactive, ...rest }: MenuItemsProps) {
  return (
    <div
      {...rest}
      className={classNames(className, classes.menuItem, interactive && classes.interactive, active && classes.active)}
    >
      {icon && <Icon of={icon} className={classes.icon} />}
      {children}
    </div>
  );
}

MenuItem.defaultProps = {
  interactive: true,
};
