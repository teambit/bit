import React from 'react';
import classnames from 'classnames';
import { NavLink, NavLinkProps, useRouteMatch } from 'react-router-dom';

import styles from './top-bar-nav.module.scss';
import { extendPath } from '../../../react-router/extend-path/extend-path';

export function TopBarNav(props: NavLinkProps) {
  const { url } = useRouteMatch();
  const { to } = props;
  const target = typeof to === 'string' ? extendPath(url, to) : to;

  return (
    <NavLink
      {...props}
      className={classnames(props.className, styles.topBarLink)}
      activeClassName={classnames(props.className, styles.active)}
      to={target}
    />
  );
}
