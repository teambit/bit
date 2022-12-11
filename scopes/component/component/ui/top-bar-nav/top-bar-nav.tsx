import React from 'react';
import classnames from 'classnames';
import { useLocation } from 'react-router-dom';
import { Link } from '@teambit/base-react.navigation.link';
import { NavPluginProps } from '../menu/nav-plugin';

import styles from './top-bar-nav.module.scss';

export function TopBarNav({ href, className, activeClassName, children, displayName, ...rest }: NavPluginProps) {
  const { search } = useLocation(); // sticky query params

  // @hack - this is so that the displayName will not pass to the link and cause a warning in the console.
  // it is used for component page nav link widgets (code, aspects etc),
  // but not for regular menu links (overview, compositions, etc).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const preventPassingDisplayNameToLink = displayName;

  const target = href && `${href}${search}`;

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
