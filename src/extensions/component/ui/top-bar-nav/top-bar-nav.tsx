import React from 'react';
import classnames from 'classnames';
import { NavLink, NavLinkProps, useRouteMatch } from 'react-router-dom';

import styles from './top-bar-nav.module.scss';

export function TopBarNav(props: NavLinkProps) {
  const { url } = useRouteMatch();

  return (
    <NavLink
      {...props}
      className={classnames(props.className, styles.topBarLink)}
      activeClassName={classnames(props.className, styles.active)}
      to={`${url}/${props.to}`}
    />
  );
}
