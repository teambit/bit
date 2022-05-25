import React, { PropsWithChildren, forwardRef } from 'react';
import { RoutingProvider, Routing } from '@teambit/base-ui.routing.routing-provider';
import type { NavLinkProps } from '@teambit/base-ui.routing.native-nav-link';
import { Link, useLocation } from '@teambit/base-react.navigation.link';

function useLegacyRouting(): Routing {
  return {
    Link,
    // eslint-disable-next-line react/prop-types
    NavLink: forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLinkAdapter({ isActive, ...props }, ref) {
      const active = isActive?.();
      return <Link {...props} active={active} ref={ref} />;
    }),
    useLocation: () =>
      // @ts-ignore
      useLocation() ?? { pathname: '/', hash: '', search: '' },
  };
}

export function LegacyNavProvider({ children }: PropsWithChildren<{}>) {
  const legacyRouting = useLegacyRouting();

  return <RoutingProvider value={legacyRouting}>{children}</RoutingProvider>;
}
