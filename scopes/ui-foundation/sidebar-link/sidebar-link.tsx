import { Icon } from '@teambit/evangelist.elements.icon';
import { NavLink, NavLinkProps } from '@teambit/react-router';
import classNames from 'classnames';
import React from 'react';

import styles from './sidebar-link.module.scss';

export type SidebarLinkProps = {
  icon?: string;
  href?: string;
} & NavLinkProps;

export function SidebarLink({ href, children, icon, ...rest }: SidebarLinkProps) {
  return (
    <NavLink {...rest} exact href={href} activeClassName={styles.active} className={classNames(styles.sidebarLink)}>
      {icon && <Icon of={icon} className={styles.icon} />}
      {children}
    </NavLink>
  );
}
