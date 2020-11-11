import React from 'react';
import { Link as ReactRouterLink } from 'react-router-dom';
import { NativeLink, LinkProps } from '@teambit/ui.routing.native-link';

export { LinkProps };

// React Router equivalent of an <a/> tag, with the standard Anchor tag props.
export function Link({ href = '', ...rest }: LinkProps) {
  if (rest.external) {
    return <NativeLink {...rest} href={href} />;
  }

  return <ReactRouterLink {...rest} to={href} />;
}
