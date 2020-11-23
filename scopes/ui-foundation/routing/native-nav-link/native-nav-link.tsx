import React, { useMemo } from 'react';
import classnames from 'classnames';

import { NativeLink, LinkProps } from '@teambit/ui.routing.native-link';
import { compareUrl } from '@teambit/ui.routing.compare-url';

export type NavLinkProps = LinkProps & {
  /** class name to apply when active */
  activeClassName?: string;
  /** styles to apply when active. Will be merged with the style prop */
  activeStyle?: React.CSSProperties;
  /** href should match url exactly in order to apply. */
  exact?: boolean;
  /** take in consideration trailing slash on the location pathname */
  strict?: boolean;
};

/**
 * A special version of the `<NativeLink/>` that will add styles to the rendered element when it matches the current URL.
 * Used to provide default fallbacks for react-router link
 */
export function NativeNavLink({
  activeClassName,
  activeStyle,
  exact,
  strict,
  style,
  className,
  ...rest
}: NavLinkProps) {
  const activeHref = window.location.href;

  const isActive = useMemo(() => rest.href && compareUrl(activeHref, rest.href), [
    exact,
    strict,
    activeHref,
    rest.href,
  ]);

  const combinedStyles = useMemo(() => (isActive && activeStyle ? { ...style, ...activeStyle } : style), [
    isActive,
    style,
  ]);

  return <NativeLink {...rest} style={combinedStyles} className={classnames(className, isActive && activeClassName)} />;
}
