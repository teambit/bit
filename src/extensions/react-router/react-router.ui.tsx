import React from 'react';
import { Slot } from '@teambit/harmony';
import { BrowserRouter, RouteProps } from 'react-router-dom';
import { SlotRouter, RouteSlot } from './slot-router';

export class ReactRouterUI {
  constructor(
    /**
     * route slot.
     */
    private routeSlot: RouteSlot
  ) {}

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

  static async provider(deps, config, [routeSlot]: [RouteSlot]) {
    return new ReactRouterUI(routeSlot);
  }
}
