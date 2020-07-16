import React from 'react';
import { Switch, Route, useRouteMatch, RouteProps, NavLinkProps } from 'react-router-dom';

import { extendPath } from './extend-path/extend-path';
import { SlotRegistry } from '../../api';

export type RouteSlot = SlotRegistry<RouteProps>;
export type NavigationSlot = SlotRegistry<NavLinkProps>;

export function SlotRouter({ slot }: { slot: RouteSlot }) {
  const routes = slot.values();
  // TODO - generate key as part of the slot.

  return (
    <Switch>
      {routes.map((route, idx) => (
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
