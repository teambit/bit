import React from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { Switch, BrowserRouter } from 'react-router-dom';
import { Route as RouteType } from './route';

export type RouteSlotRegistry = SlotRegistry<RouteType>;

export class ReactRouterUI {
  constructor(
    /**
     * route slot.
     */
    private routeSlot: RouteSlotRegistry
  ) {}

  /**
   * render all slot routes.
   */
  renderRoutes(): JSX.Element {
    return (
      <BrowserRouter>
        <Switch>
          {this.routeSlot.values().map(routeGetter => {
            return routeGetter();
          })}
        </Switch>
      </BrowserRouter>
    );
  }

  /**
   * register a new route.
   */
  register(route: RouteType) {
    this.routeSlot.register(route);
    return this;
  }

  static slots = [Slot.withType<JSX.Element>()];

  static async provider(deps, config, [routeSlot]: [RouteSlotRegistry]) {
    return new ReactRouterUI(routeSlot);
  }
}

export { RouteType };
