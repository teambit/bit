import React, { useEffect, ComponentType } from 'react';
import { BrowserRouter, MemoryRouter, HashRouter, RouteProps, useHistory, useLocation } from 'react-router-dom';
import { RoutingProvider } from '@teambit/ui.routing.provider';
import { RouteSlot, SlotRouter } from '@teambit/ui.react-router.slot-router';
import { Link } from '@teambit/ui.react-router.link';
import { NavLink } from '@teambit/ui.react-router.nav-link';
import { ReactRouterUI } from './react-router.ui.runtime';
import { Routing } from './routing-method';

export type History = ReturnType<typeof useHistory>;

type RouterContextProps = {
  rootRoutes: RouteProps[];
  routeSlot: RouteSlot;
  reactRouterUi: ReactRouterUI;
  routing?: Routing;
};

const reactRouterRouting = { Link, NavLink, useLocation };

export function RouteContext({ rootRoutes, routeSlot, reactRouterUi, routing = Routing.url }: RouterContextProps) {
  const Router = getRouter(routing);

  return (
    <Router>
      <RoutingProvider value={reactRouterRouting}>
        <RouterGetter onRouter={reactRouterUi.setRouter} />
        <SlotRouter slot={routeSlot} rootRoutes={rootRoutes} />
      </RoutingProvider>
    </Router>
  );
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

// needs to be rendered inside of <BrowserRouter/>
function RouterGetter({ onRouter: onHistory }: { onRouter: (routerHistory: History) => void }) {
  const history = useHistory();
  useEffect(() => onHistory(history), [history]);

  return null;
}
