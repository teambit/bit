import { SlotRegistry } from '@teambit/harmony';
import React from 'react';
import { Routes, Route, RouteProps } from 'react-router-dom';
import { flatten } from 'lodash';
import type { LinkProps } from '@teambit/base-react.navigation.link';

export type RouteSlot = SlotRegistry<RouteProps | RouteProps[]>;
export type NavigationSlot = SlotRegistry<LinkProps>;

export type SlotRouterProps = {
  slot: RouteSlot;
  rootRoutes?: RouteProps[];
};

export function SlotRouter({ slot, rootRoutes }: SlotRouterProps) {
  const routes = flatten(slot.values());

  const withRoot = routes.concat(rootRoutes || []);

  return (
    <Routes>
      {withRoot.map((route, idx) => (
        <Route key={idx} {...route} />
      ))}
    </Routes>
  );
}
