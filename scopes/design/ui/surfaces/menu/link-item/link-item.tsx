import { Icon } from '@teambit/evangelist.elements.icon';
import { NavLink, NavLinkProps } from '@teambit/ui.react-router.nav-link';
import classNames from 'classnames';
import React from 'react';

import styles from './link-item.module.scss';

export type MenuLinkItemProps = {
  icon?: string;
  href?: string;
} & NavLinkProps;

export function MenuLinkItem({ href, children, icon, className, activeClassName, ...rest }: MenuLinkItemProps) {
  return (
    <NavLink
      {...rest}
      href={href}
      activeClassName={classNames(styles.active, activeClassName)}
      className={classNames(styles.menuLinkItem, className)}
    >
      {icon && <Icon of={icon} className={styles.icon} />}
      {children}
    </NavLink>
  );
}
