import { Slot } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import React from 'react';
import { BrowserRouter, RouteProps } from 'react-router-dom';

import { ReactRouterAspect } from './react-router.aspect';
import { RouteSlot, SlotRouter } from './slot-router';

export class ReactRouterUI {
  constructor(
    /**
     * route slot.
     */
    private routeSlot: RouteSlot
  ) {}

  link() {}

  /**
   * render all slot routes.
   */
  renderRoutes(routes: RouteProps[]): JSX.Element {
    return (
      <BrowserRouter>
        <SlotRouter slot={this.routeSlot} rootRoutes={routes} />
      </BrowserRouter>
    );
  }

  /**
   * register a new route.
   */
  register(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  static slots = [Slot.withType<RouteProps>()];

  static runtime = UIRuntime;

  static async provider(deps, config, [routeSlot]: [RouteSlot]) {
    return new ReactRouterUI(routeSlot);
  }
}

ReactRouterAspect.addRuntime(ReactRouterUI);
