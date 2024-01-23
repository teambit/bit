import React, { useMemo, forwardRef } from 'react';
import classnames from 'classnames';
import { Link, NavLink } from 'react-router-dom';
import { parsePath } from 'history';
import { LinkProps } from '@teambit/base-react.navigation.link';

export const ReactRouterLink = forwardRef<HTMLAnchorElement, LinkProps>(function LinkWithRef(
  {
    children = null,
    href = '',
    state,
    style,
    className,
    activeClassName,
    activeStyle,

    active,
    exact,
    // strict is removed in RR6, but included in our interface
    strict,

    native,
    external,
    ...props
  }: LinkProps,
  ref
) {
  const to = useMemo(() => ({ ...parsePath(href), state }), [href, state]);

  if (activeClassName || activeStyle) {
    return (
      // @ts-ignore (https://github.com/teambit/bit/issues/4401)
      <NavLink
        to={to}
        ref={ref}
        end={exact}
        style={({ isActive }) => ({ ...style, ...((active ?? isActive) && activeStyle) })}
        className={({ isActive }) => classnames(className, (active ?? isActive) && activeClassName)}
        {...props}
      >
        {children}
      </NavLink>
    );
  }

  // @ts-ignore (https://github.com/teambit/bit/issues/4401)
  return (
    <Link {...props} className={className} style={style} to={to} ref={ref}>
      {children}
    </Link>
  );
});
