import React, { forwardRef, useMemo } from 'react';
import { NavLink as BaseNavLink } from 'react-router-dom';
import { parsePath } from 'history';
import { NavLinkProps } from '@teambit/base-react.navigation.routing-provider';
import { LinkAnchor, useLinkContext } from '@teambit/ui-foundation.ui.navigation.react-router.link-anchor';

export type { NavLinkProps };

/**
 * Adapter between React router's NavLink and our isomorphic Navlink components. Learn more [Here](https://bit.dev/teambit/base-react/navigation/router-context)
 */
export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink(
  {
    href = '',
    state,
    active,
    // props we should not get, and should not pass to RR link:
    external,
    native,
    ...rest
  }: NavLinkProps,
  ref
) {
  const to = useMemo(() => ({ ...parsePath(href), state }), [href, state]);

  const isActive = useMemo(() => {
    if (active === undefined) return undefined;

    return () => active;
  }, [active]);

  // only use anchor when its context is available
  const { baseUrl } = useLinkContext();
  const component = baseUrl ? LinkAnchor : undefined;

  // @ts-ignore (https://github.com/teambit/bit/issues/4401)
  return <BaseNavLink to={to} isActive={isActive} component={component} {...rest} ref={ref} />;
});
