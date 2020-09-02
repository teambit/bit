import { extendPath, NavLink, NavLinkProps } from '@teambit/react-router';
import classnames from 'classnames';
import React from 'react';
import { useRouteMatch } from 'react-router-dom';

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
