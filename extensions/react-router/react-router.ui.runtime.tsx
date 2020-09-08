import React from 'react';
import { Slot } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import { BrowserRouter, RouteProps, useHistory } from 'react-router-dom';

import { ReactRouterAspect } from './react-router.aspect';
import { RouteSlot, SlotRouter } from './slot-router';

type History = ReturnType<typeof useHistory>;

export class ReactRouterUI {
  constructor(
    /**
     * route slot.
     */
    private routeSlot: RouteSlot
  ) {}

  private routerHistory?: History;

  link() {}

  /**
   * render all slot routes.
   */
  renderRoutes(routes: RouteProps[]): JSX.Element {
    return <RoutesRoot routeSlot={this.routeSlot} rootRoutes={routes} reactRouterUi={this} />;
  }

  /** sets the routing engine for navigation methods (internal method) */
  setRouter = (routerHistory: History) => {
    this.routerHistory = routerHistory;
  };

  /**
   * register a new route.
   */
  register(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  /**
   * change browser location
   */
  navigateTo = (
    /** destination */
    path: string
  ) => {
    this.routerHistory?.push(path);
  };

  static slots = [Slot.withType<RouteProps>()];

  static runtime = UIRuntime;

  static async provider(deps, config, [routeSlot]: [RouteSlot]) {
    return new ReactRouterUI(routeSlot);
  }
}

ReactRouterAspect.addRuntime(ReactRouterUI);

function RoutesRoot({
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

function RouterGetter({ onRouter: onHistory }: { onRouter: (routerHistory: History) => void }) {
  const history = useHistory();
  onHistory(history);

  return null;
}
