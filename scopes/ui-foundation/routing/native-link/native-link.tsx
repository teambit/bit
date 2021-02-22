import React, { useCallback } from 'react';

export type LinkProps = {
  /** When true, clicking the link will replace the current entry in the history stack instead of adding a new one */
  replace?: boolean;
  /** Open link in a new tab */
  external?: boolean;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>;

/** anchor tag attributes that securely open link in a new tab. */
const externalLinkAttributes = { rel: 'noopener', target: '_blank' };

/**
 * Equivalent to an `<a/>` tag, with a few additional options.
 * Used to provide default fallbacks for react-router link
 */
export function NativeLink({ href = '', external, replace, onClick, ...rest }: LinkProps) {
  const externalProps = external ? externalLinkAttributes : {};

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      const res = onClick?.(e);
      if (e.defaultPrevented || !replace || external) return res;

      e.preventDefault();
      window.location.replace(href);

      return res;
    },
    [href, replace, onClick]
  );

  // @ts-ignore TOOD: @Uri please check this
  return <a {...rest} {...externalProps} onClick={handleClick} href={href} />;
}
