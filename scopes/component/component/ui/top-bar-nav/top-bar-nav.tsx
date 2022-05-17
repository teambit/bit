import React from 'react';
import classnames from 'classnames';
import { useRouteMatch, useLocation } from 'react-router-dom';
import { Link, LinkProps } from '@teambit/base-react.navigation.link';
import { extendPath } from '@teambit/ui-foundation.ui.react-router.extend-path';

import styles from './top-bar-nav.module.scss';

export type TopBarNavProps = {} & LinkProps;

export function TopBarNav({ href, className, activeClassName, children, ...rest }: TopBarNavProps) {
  const { url } = useRouteMatch();
  const { search } = useLocation(); // sticky query params

  const target = `${extendPath(url, href)}${search}`;

  return (
    <Link
      {...rest}
      className={classnames(className, styles.topBarLink)}
      activeClassName={classnames(activeClassName, styles.active)}
      href={target}
    >
      <div>{children}</div>
    </Link>
  );
}
