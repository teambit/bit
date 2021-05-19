import React from 'react';
import { NavLink as ReactRouterNavLink } from 'react-router-dom';
import { NativeNavLink, NavLinkProps } from '@teambit/base-ui.routing.native-nav-link';
import { LinkAnchor } from '@teambit/ui-foundation.ui.react-router.link-anchor';

export { NavLinkProps };

// React Router equivalent of an <a/> tag, with added styles when href matches the current url.
export function NavLink({ href = '', ...rest }: NavLinkProps) {
  if (rest.external) {
    return <NativeNavLink {...rest} href={href} />;
  }

  return <ReactRouterNavLink {...rest} to={href} component={LinkAnchor} />;
}
