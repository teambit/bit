import React from 'react';
import { Switch, Route, useRouteMatch, RouteProps } from 'react-router-dom';

import { extendPath } from './extend-path';
import { SlotRegistry } from '../../api';
import { NavLinkProps } from './nav-link';

export type RouteSlot = SlotRegistry<RouteProps>;
export type NavigationSlot = SlotRegistry<NavLinkProps>;

export type SlotRouterProps = {
  slot: RouteSlot;
  rootRoutes?: RouteProps[];
};

export function SlotRouter({ slot, rootRoutes }: SlotRouterProps) {
  const routes = slot.values();
  const withRoot = routes.concat(rootRoutes || []);

  return (
    <Switch>
      {withRoot.map((route, idx) => (
        <Route key={idx} {...route} />
      ))}
    </Switch>
  );
}

export function SlotSubRouter({ slot, basePath }: { slot: RouteSlot; basePath?: string }) {
  const routes = slot.values();
  const { path: contextPath } = useRouteMatch();
  // TODO - generate key as part of the slot.

  return (
    <Switch>
      {routes.map((route, idx) => (
        <Route key={idx} {...route} path={extendPath(basePath || contextPath, route.path)} />
      ))}
    </Switch>
  );
}
