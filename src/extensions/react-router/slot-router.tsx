import React from 'react';
import { Switch, Route, useRouteMatch, RouteProps, NavLinkProps } from 'react-router-dom';

import { ExtendPath } from './extend-path';
import { SlotRegistry } from '../../api';

export type RouteSlot = SlotRegistry<RouteProps>;
export type NavigationSlot = SlotRegistry<NavLinkProps>;

function RouteSlot({ slot }: { slot: RouteSlot }) {
  const routes = slot.values();
  const { path: contextPath } = useRouteMatch();
  // TODO - generate key as part of the slot.

  return (
    <Switch>
      {routes.map((route, idx) => (
        <Route key={idx} {...route} path={contextPath} />
      ))}
    </Switch>
  );
}

export function SubRouteSlot({ slot, basePath }: { slot: RouteSlot; basePath?: string }) {
  const routes = slot.values();
  const { path: contextPath } = useRouteMatch();
  // TODO - generate key as part of the slot.

  return (
    <Switch>
      {routes.map((route, idx) => (
        <Route key={idx} {...route} path={ExtendPath(basePath || contextPath, route.path)} />
      ))}
    </Switch>
  );
}
