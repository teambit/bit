import React from 'react';
import classnames from 'classnames';
import { NavLink, NavLinkProps, useRouteMatch } from 'react-router-dom';

import styles from './top-bar-widget-link.module.scss';

export function TopBarWidgetLink(props: NavLinkProps) {
  const { url } = useRouteMatch();

  return (
    <NavLink
      {...props}
      className={classnames(props.className, styles.widgetLink)}
      activeClassName={classnames(props.className, styles.active)}
      to={`${url}/${props.to}`}
    >
      {props.children}
    </NavLink>
  );
}
