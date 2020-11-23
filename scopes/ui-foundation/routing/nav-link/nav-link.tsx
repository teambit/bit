import React from 'react';
import type { NavLinkProps } from '@teambit/ui.routing.native-nav-link';
import { useRouting } from '@teambit/ui.routing.provider';

export type { NavLinkProps };

export function NavLink(props: NavLinkProps) {
  const ActualNavLink = useRouting().NavLink;
  return <ActualNavLink {...props} />;
}
