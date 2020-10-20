import { extendPath, NavLink, NavLinkProps } from '@teambit/react-router';
import classnames from 'classnames';
import React from 'react';
import { useRouteMatch, useLocation } from 'react-router-dom';

import styles from './top-bar-nav.module.scss';

export function TopBarNav(props: NavLinkProps) {
  const { url } = useRouteMatch();
  const { search } = useLocation(); // sticky query params
  const { href } = props;

  const target = `${extendPath(url, href)}${search}`;

  return (
    <NavLink
      {...props}
      className={classnames(props.className, styles.topBarLink)}
      activeClassName={classnames(props.className, styles.active)}
      href={target}
    >
      <div>{props.children}</div>
    </NavLink>
  );
}
