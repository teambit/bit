import React from 'react';
import { Link as ReactRouterLink } from 'react-router-dom';
import { NativeLink, LinkProps } from '@teambit/base-ui.routing.native-link';

export { LinkProps };

/** Adapter between React router's Link and our isomorphic link components. Learn more [Here](https://bit.dev/teambit/base-ui/routing/routing-provider) */
export function Link({ href = '', ...rest }: LinkProps) {
  if (rest.external) {
    return <NativeLink {...rest} href={href} />;
  }

  // @ts-ignore (#4401)
  return <ReactRouterLink {...rest} to={href} />;
}
