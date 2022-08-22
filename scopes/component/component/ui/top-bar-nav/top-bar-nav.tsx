import React from 'react';
import classnames from 'classnames';
import { useLocation } from 'react-router-dom';
import { Link, LinkProps } from '@teambit/base-react.navigation.link';

import styles from './top-bar-nav.module.scss';

export type TopBarNavProps = {} & LinkProps;

export function TopBarNav({ href, className, activeClassName, children, ...rest }: TopBarNavProps) {
  const { search } = useLocation(); // sticky query params
  const target = `${href}${search}`;

  return (
    <Link
      {...rest}
      className={classnames(className, styles.topBarLink)}
      activeClassName={classnames(activeClassName, styles.active)}
      href={target}
    >
      <div>{children} !</div>
    </Link>
  );
}
