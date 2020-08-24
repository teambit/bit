import { extendPath, NavLink, NavLinkProps } from '@teambit/react-router';
import classnames from 'classnames';
import React from 'react';
import { useRouteMatch } from 'react-router-dom';

import styles from './top-bar-nav.module.scss';

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
    >
      <div>{props.children}</div>
    </NavLink>
  );
}
