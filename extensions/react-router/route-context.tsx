import React, { useEffect, ComponentType } from 'react';
import { BrowserRouter, MemoryRouter, HashRouter, RouteProps, useHistory } from 'react-router-dom';
import { RouteSlot, SlotRouter } from './slot-router';
import { ReactRouterUI } from './react-router.ui.runtime';

export type History = ReturnType<typeof useHistory>;

export enum Routing {
  url,
  hash,
  inMemory,
}

type RouterContextProps = {
  rootRoutes: RouteProps[];
  routeSlot: RouteSlot;
  reactRouterUi: ReactRouterUI;
  routing?: Routing;
};

export function RouteContext({ rootRoutes, routeSlot, reactRouterUi, routing = Routing.url }: RouterContextProps) {
  const Router = getRouter(routing);

  return (
    <Router>
      <RouterGetter onRouter={reactRouterUi.setRouter} />
      <SlotRouter slot={routeSlot} rootRoutes={rootRoutes} />
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
