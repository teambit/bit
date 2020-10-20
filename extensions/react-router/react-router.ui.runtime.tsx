import React from 'react';
import { Slot } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import { RouteProps, useHistory } from 'react-router-dom';

import { ReactRouterAspect } from './react-router.aspect';
import { RouteSlot } from './slot-router';
import { RouteContext } from './route-context';

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
    return <RouteContext routeSlot={this.routeSlot} rootRoutes={routes} reactRouterUi={this} />;
  }

  /** sets the routing engine for navigation methods (internal method) */
  setRouter: (routerHistory: History) => void = (routerHistory: History): void => {
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
