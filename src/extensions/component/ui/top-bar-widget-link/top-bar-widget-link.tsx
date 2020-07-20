import React from 'react';
import classnames from 'classnames';

import { useRouteMatch } from 'react-router-dom';
import { NavLink, NavLinkProps } from '../../../react-router/nav-link';
import { extendPath } from '../../../react-router/extend-path';
import styles from './top-bar-widget-link.module.scss';

export function TopBarWidgetLink(props: NavLinkProps) {
  const { url } = useRouteMatch();

  return (
    <NavLink
      {...props}
      className={classnames(props.className, styles.widgetLink)}
      activeClassName={classnames(props.className, styles.active)}
      href={extendPath(url, props.href)}
    >
      {props.children}
    </NavLink>
  );
}
