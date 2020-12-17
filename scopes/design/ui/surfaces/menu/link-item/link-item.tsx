import { Icon } from '@teambit/evangelist.elements.icon';
import { NavLink, NavLinkProps } from '@teambit/ui.routing.nav-link';
import { classes } from '@teambit/ui.surfaces.menu.item';
import classNames from 'classnames';
import React from 'react';

export type MenuLinkItemProps = {
  icon?: string;
  href?: string;
} & NavLinkProps;

export function MenuLinkItem({ href, children, icon, className, activeClassName, ...rest }: MenuLinkItemProps) {
  return (
    <NavLink
      {...rest}
      href={href}
      className={classNames(className, classes.menuItem, classes.interactive)}
      activeClassName={classNames(activeClassName, classes.active)}
    >
      {icon && <Icon of={icon} className={classes.icon} />}
      {children}
    </NavLink>
  );
}
