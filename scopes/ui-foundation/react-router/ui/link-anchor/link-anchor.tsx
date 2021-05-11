import React, { forwardRef } from 'react';
import urlJoin from 'url-join';
import { useLinkContext } from './link-context';
// @ts-ignore - original file copied from another project
import { LinkAnchor as BaseLinkAnchor } from './link-anchor.base';

const fullUrlRegex = /^(\w*:)?\/\//;

type ReactRouterLinkProps = {
  /** @deprecated */
  innerRef?: any;
  navigate: () => void;
};
type LinkAnchorProps = ReactRouterLinkProps & React.AnchorHTMLAttributes<HTMLAnchorElement>;

/**
 * React Router compatible Anchor element, with base-url from context.
 */
export const LinkAnchor = forwardRef<HTMLAnchorElement, LinkAnchorProps>(
  ({ href, ...rest }: LinkAnchorProps, forwardedRef) => {
    const _href = useContextUrl(href);

    // @ts-ignore - BaseLinkAnchor picks up some types (probably because of forwardRef)
    return <BaseLinkAnchor {...rest} ref={forwardedRef} href={_href} />;
  }
);

LinkAnchor.displayName = 'LinkAnchor';

function useContextUrl(href?: string) {
  const { baseUrl } = useLinkContext();

  if (!href || !baseUrl || fullUrlRegex.test(href)) return href;

  return urlJoin(baseUrl, href);
}
