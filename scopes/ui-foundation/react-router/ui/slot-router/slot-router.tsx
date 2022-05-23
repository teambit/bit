import React, { PropsWithChildren } from 'react';
import { SlotRegistry } from '@teambit/harmony';
import { Routes, Route, RouteProps } from 'react-router-dom';
import { flatten } from 'lodash';
import type { LinkProps } from '@teambit/base-react.navigation.link';

export type RouteSlot = SlotRegistry<RouteProps | RouteProps[]>;
export type NavigationSlot = SlotRegistry<LinkProps>;

export type SlotRouterProps = PropsWithChildren<{
  slot: RouteSlot;
  rootRoutes?: RouteProps[];
  parentPath?: string;
}>;

export function SlotRouter({ slot, rootRoutes, children, parentPath }: SlotRouterProps) {
  const routes = flatten(slot.values());
  const withRoot = routes.concat(rootRoutes || []);

  const jsxRoutes = withRoot.map((route) => <Route key={toKey(route)} {...route} />);

  if (parentPath) {
    return (
      <Routes>
        <Route path={parentPath}>
          {jsxRoutes}
          {children}
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path={parentPath}>
        {jsxRoutes}
        {children}
      </Route>
    </Routes>
  );
}

function toKey(route: RouteProps) {
  if (route.path) return route.path;
  if (route.index) return '/';
  return '.';
}
