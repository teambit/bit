import React, { useMemo } from 'react';
import classnames from 'classnames';

import { NativeLink, LinkProps } from '@teambit/ui.routing.native-link';
import { compareUrl } from '@teambit/ui.routing.compare-url';
import { isBrowser } from '@teambit/ui.is-browser';

export type NavLinkProps = LinkProps & {
  /** class name to apply when active */
  activeClassName?: string;
  /** styles to apply when active. Will be merged with the style prop */
  activeStyle?: React.CSSProperties;
  /** href should match url exactly in order to apply. */
  exact?: boolean;
  /** take in consideration trailing slash on the location pathname */
  strict?: boolean;
  /** explicit active state override */
  isActive?: (() => boolean) | undefined;
};

/**
 * A special version of the `<NativeLink/>` that will add styles to the rendered element when it matches the current URL.
 * Used to provide default fallbacks for react-router link
 */
export function NativeNavLink({
  activeClassName,
  activeStyle,
  isActive,
  exact,
  strict,
  style,
  className,
  ...rest
}: NavLinkProps) {
  // TODO - consider using getLocation()
  const activeHref = isBrowser ? window.location.href : '/';

  const isDefaultActive = useMemo(() => rest.href && compareUrl(activeHref, rest.href), [
    exact,
    strict,
    activeHref,
    rest.href,
  ]);

  const calcIsActive = isActive?.() || isDefaultActive;

  const combinedStyles = useMemo(() => (calcIsActive && activeStyle ? { ...style, ...activeStyle } : style), [
    calcIsActive,
    style,
  ]);

  return (
    <NativeLink {...rest} style={combinedStyles} className={classnames(className, calcIsActive && activeClassName)} />
  );
}
