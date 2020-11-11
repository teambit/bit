import React, { useEffect, ComponentType, ReactNode } from 'react';
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
  const Router = getRouter(routing);

  return (
    // {/* set up the virtual router (browser, inMemory, etc) */}
    <Router>
      {/* injects History object back to reactRouterUi */}
      <RouterGetter onRouter={reactRouterUi.setRouter} />
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

function getRouter(type: Routing): ComponentType {
  switch (type) {
    case Routing.inMemory:
      return MemoryRouter;
    case Routing.hash:
      return HashRouter;
    case Routing.url:
    default:
      return BrowserRouter;
  }
}

/**
 * Calls onRouter when routing History object changes.
 * Used to inject history back into reactRouterUi
 * (needs to be rendered inside of <BrowserRouter/>)
 */
function RouterGetter({ onRouter: onHistory }: { onRouter: (routerHistory: History) => void }) {
  const history = useHistory();
  useEffect(() => onHistory(history), [history]);

  return null;
}
