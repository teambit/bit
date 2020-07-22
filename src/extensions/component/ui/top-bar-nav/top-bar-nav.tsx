import React from 'react';
import classnames from 'classnames';
import { useRouteMatch } from 'react-router-dom';

import styles from './top-bar-nav.module.scss';
import { extendPath } from '../../../react-router/extend-path';
import { NavLink, NavLinkProps } from '../../../react-router/nav-link';

export function TopBarNav(props: NavLinkProps) {
  const { url } = useRouteMatch();
  const { href } = props;
  const target = extendPath(url, href);

  return (
    <NavLink
      {...props}
      className={classnames(props.className, styles.topBarLink)}
      activeClassName={classnames(props.className, styles.active)}
      href={target}
    />
  );
}
