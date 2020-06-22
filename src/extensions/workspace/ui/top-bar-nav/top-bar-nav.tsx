import React from 'react';
import classnames from 'classnames';
import { NavLink, NavLinkProps } from 'react-router-dom';
import styles from './top-bar-nav.module.scss';

export function TopBarNav(props: NavLinkProps) {
  const baseRoute = '/'; //TODO

  return (
    <NavLink
      {...props}
      className={classnames(props.className, styles.topBarLink)}
      activeClassName={classnames(props.className, styles.active)}
      to={`${baseRoute}${props.to}`}
    />
  );
}
