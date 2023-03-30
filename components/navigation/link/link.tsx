import React, { forwardRef } from 'react';
import { useNavigation } from './navigation-provider';
import type { LinkProps } from './link.type';
import { NativeLink } from './native-link';

/** implementation agnostic Link component, basic on the standard `a` tag */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(props: LinkProps, ref) {
  const nav = useNavigation();
  const ActualLink = nav.Link || NativeLink;

  if (props.native || props.external) {
    return <NativeLink {...props} ref={ref} />;
  }

  return <ActualLink {...props} ref={ref} />;
});
