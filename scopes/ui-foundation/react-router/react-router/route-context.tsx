import React, { ReactNode } from 'react';
import { BrowserRouter, MemoryRouter, HashRouter, RouteProps } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { RouteSlot, SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { NavigationProvider } from '@teambit/base-react.navigation.link';
import { reactRouterAdapter } from '@teambit/ui-foundation.ui.navigation.react-router-adapter';
import { ReactRouterUI } from './react-router.ui.runtime';
import { Routing } from './routing-method';

type RouterContextProps = {
  reactRouterUi: ReactRouterUI;
  routing?: Routing;
  children: ReactNode;
  location?: string;
};

type RootRouteProps = {
  rootRoutes: RouteProps[];
  routeSlot: RouteSlot;
};

/**
 * Setup context needed for routing.
 */
export function RouteContext({ routing = Routing.url, children, location }: RouterContextProps) {
  return (
    <Router type={routing} location={location}>
      <NavigationProvider implementation={reactRouterAdapter}>{children}</NavigationProvider>
    </Router>
  );
}

export function RootRoute({ rootRoutes, routeSlot }: RootRouteProps) {
  return <SlotRouter slot={routeSlot} rootRoutes={rootRoutes} />;
}

/** provides the router engine (browser, inMemory, etc) */
function Router({ type, children, location }: { type: Routing; children: ReactNode; location?: string }) {
  switch (type) {
    case Routing.static:
      return <StaticRouter location={location || '/'}>{children}</StaticRouter>;
    case Routing.inMemory:
      return (
        <MemoryRouter initialEntries={[location || '/']} initialIndex={1}>
          {children}
        </MemoryRouter>
      );
    case Routing.hash:
      // @ts-ignore - https://github.com/teambit/bit/issues/5746
      return <HashRouter>{children}</HashRouter>;
    case Routing.url:
    default:
      // @ts-ignore - https://github.com/teambit/bit/issues/5746
      return <BrowserRouter>{children}</BrowserRouter>;
  }
}
