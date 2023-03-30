import React, { useMemo, forwardRef, AnchorHTMLAttributes } from 'react';
import classNames from 'classnames';
import { compareUrl } from '@teambit/base-ui.routing.compare-url';
import { useLocation } from './use-location';
import type { BaseLinkProps, LinkProps } from './link.type';

const externalLinkAttributes = { rel: 'noopener', target: '_blank' };

export type LinkPropsWithHTMLAttributes = BaseLinkProps & AnchorHTMLAttributes<HTMLAnchorElement>;

export const NativeLink = forwardRef<HTMLAnchorElement, LinkProps>(function NativeLink(
  {
    className,
    style,
    activeClassName,
    activeStyle,
    active,
    strict,
    exact,
    href,
    external,
    // unused, but excluded from ...rest:
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    native,
    // unused, but excluded from ...rest:
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    state,
    ...rest
  }: LinkPropsWithHTMLAttributes,
  ref
) {
  const location = useLocation();
  // skip url compare when is irrelevant
  const shouldCalcActive = !!activeClassName || !!activeStyle;

  const isActive = useMemo(() => {
    if (!shouldCalcActive) return false;
    if (typeof active === 'boolean') return active;
    if (!location || !href) return false;

    return compareUrl(location.pathname, href, { exact, strict });
  }, [active, href, location, shouldCalcActive]);

  const externalProps = external ? externalLinkAttributes : {};
  const combinedStyles = useMemo(
    () => (isActive && activeStyle ? { ...style, ...activeStyle } : style),
    [isActive, style]
  );

  return (
    <a
      {...externalProps}
      {...rest}
      ref={ref}
      href={href}
      className={classNames(className, isActive && activeClassName)}
      style={combinedStyles}
    />
  );
});
