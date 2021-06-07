import React from 'react';
import { NavLink as ReactRouterNavLink } from 'react-router-dom';
import { NativeNavLink, NavLinkProps } from '@teambit/base-ui.routing.native-nav-link';
import { LinkAnchor } from '@teambit/ui-foundation.ui.react-router.link-anchor';

export { NavLinkProps };

/** Adapter between React router's Nav and our isomorphic link components. Learn more [Here](https://bit.dev/teambit/base-ui/routing/routing-provider) */
export function NavLink({ href = '', ...rest }: NavLinkProps) {
  if (rest.external) {
    return <NativeNavLink {...rest} href={href} />;
  }

  return <ReactRouterNavLink {...rest} to={href} component={LinkAnchor} />;
}
