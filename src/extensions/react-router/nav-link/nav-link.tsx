import React from 'react';
import { NavLink as BaseNavLink, LinkProps as BaseLinkProps, NavLinkProps as BaseNavLinkProps } from 'react-router-dom';
import { LocationState } from 'history';

/* props of NavLink except props of Link - activeClassName, exact, strict, etc */
type MatchProps<S = LocationState> = Pick<
  BaseNavLinkProps<S>,
  Exclude<keyof BaseNavLinkProps<S>, keyof BaseLinkProps<S>>
>;

export type NavLinkProps<S = LocationState> = {
  href: string;
  /** When true, clicking the link will replace the current entry in the history stack instead of adding a new one */
  replace?: boolean;
} & React.AnchorHTMLAttributes<HTMLAnchorElement> &
  MatchProps<S>;

export function NavLink({ href = '', ...rest }: NavLinkProps) {
  return <BaseNavLink {...rest} to={href} />;
}
