import { SlotRegistry } from '@teambit/harmony';
import React from 'react';
import { Route, RouteProps, Switch, useRouteMatch } from 'react-router-dom';
import { flatten } from 'lodash';
import { extendPath } from '@teambit/ui-foundation.ui.react-router.extend-path';
import { NavLinkProps } from '@teambit/base-ui.routing.nav-link';

export type RouteSlot = SlotRegistry<RouteProps | RouteProps[]>;
export type NavigationSlot = SlotRegistry<NavLinkProps>;

export type SlotRouterProps = {
  slot: RouteSlot;
  rootRoutes?: RouteProps[];
};

export function SlotRouter({ slot, rootRoutes }: SlotRouterProps) {
  const routes = flatten(slot.values());

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
  const routes = flatten(slot.values());
  const { path: contextPath } = useRouteMatch();
  // TODO - generate key as part of the slot.

  return (
    <Switch>
      {routes.map((route, idx) => (
        <Route key={idx} {...route} path={extendPath(basePath || contextPath, route.path as any)} />
      ))}
    </Switch>
  );
}
