import React from 'react';
import { BrowserRouter, RouteProps, useHistory } from 'react-router-dom';
import { RouteSlot, SlotRouter } from './slot-router';
import { ReactRouterUI } from './react-router.ui.runtime';

export type History = ReturnType<typeof useHistory>;

export function RouteContext({
  rootRoutes,
  routeSlot,
  reactRouterUi,
}: {
  rootRoutes: RouteProps[];
  routeSlot: RouteSlot;
  reactRouterUi: ReactRouterUI;
}) {
  return (
    <BrowserRouter>
      <RouterGetter onRouter={reactRouterUi.setRouter} />
      <SlotRouter slot={routeSlot} rootRoutes={rootRoutes} />
    </BrowserRouter>
  );
}

// needs to be rendered inside of <BrowserRouter/>
function RouterGetter({ onRouter: onHistory }: { onRouter: (routerHistory: History) => void }) {
  const history = useHistory();
  onHistory(history);

  return null;
}
