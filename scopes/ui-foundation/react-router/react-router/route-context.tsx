import React, { useEffect, ReactNode } from 'react';
import { BrowserRouter, MemoryRouter, HashRouter, RouteProps, useHistory } from 'react-router-dom';
import { RoutingProvider } from '@teambit/ui.routing.provider';
import { RouteSlot, SlotRouter } from '@teambit/ui.react-router.slot-router';
import { ReactRouterUI } from './react-router.ui.runtime';
import { reactRouterRouting } from './react-router-routing';
import { Routing } from './routing-method';

export type History = ReturnType<typeof useHistory>;

type RouterContextProps = {
  reactRouterUi: ReactRouterUI;
  routing?: Routing;
  children: ReactNode;
};

type RootRouteProps = {
  rootRoutes: RouteProps[];
  routeSlot: RouteSlot;
};

/**
 * Setup context needed for routing.
 */
export function RouteContext({ reactRouterUi, routing = Routing.url, children }: RouterContextProps) {
  return (
    // {/* set up the virtual router (browser, inMemory, etc) */}
    <Router type={routing}>
      {/* injects History object back to reactRouterUi */}
      <HistoryGetter onRouterChange={reactRouterUi.setRouter} />
      {/* injects react-router Link into context  */}
      <RoutingProvider value={reactRouterRouting}>
        {/* route tree root: */}
        {children}
      </RoutingProvider>
    </Router>
  );
}

export function RootRoute({ rootRoutes, routeSlot }: RootRouteProps) {
  return <SlotRouter slot={routeSlot} rootRoutes={rootRoutes} />;
}

/** provides the router engine (browser, inMemory, etc) */
function Router({ type, children }: { type: Routing; children: ReactNode }) {
  switch (type) {
    case Routing.inMemory:
      return (
        <MemoryRouter initialEntries={[window.location]} initialIndex={1}>
          {children}
        </MemoryRouter>
      );
    case Routing.hash:
      return <HashRouter>{children}</HashRouter>;
    case Routing.url:
    default:
      return <BrowserRouter>{children}</BrowserRouter>;
  }
}

/**
 * Calls onRouterChange when routing History object changes.
 * Used to inject history back into reactRouterUi
 * (needs to be rendered inside of <BrowserRouter/>)
 */
function HistoryGetter({ onRouterChange }: { onRouterChange: (routerHistory: History) => void }) {
  const history = useHistory();
  useEffect(() => onRouterChange(history), [history]);

  return null;
}
