import React from 'react';
import { Slot } from '@teambit/harmony';
import { BrowserRouter, RouteProps } from 'react-router-dom';
import { SlotRouter, RouteSlot } from './slot-router';
import { ReactRouterAspect } from './react-router.aspect';
import { UIRuntime } from '../ui';

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
