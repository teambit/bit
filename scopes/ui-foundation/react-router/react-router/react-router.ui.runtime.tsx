import React from 'react';
import { RouteProps } from 'react-router-dom';
import { History, UnregisterCallback, LocationListener } from 'history';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import { RouteSlot } from '@teambit/ui.react-router.slot-router';

import { ReactRouterAspect } from './react-router.aspect';
import { RouteContext, RootRoute } from './route-context';
import { Routing } from './routing-method';

type RouteChangeSlot = SlotRegistry<LocationListener>;

export class ReactRouterUI {
  private routerHistory?: History;
  private routingMode = Routing.url;

  constructor(
    /**
     * route slot.
     */
    private routeSlot: RouteSlot,
    /**
     *
     */
    private routeChangeListener: RouteChangeSlot
  ) {}

  /**
   * render all slot routes.
   */
  renderRoutes(routes: RouteProps[]): JSX.Element {
    return (
      <RouteContext reactRouterUi={this} routing={this.routingMode}>
        <RootRoute routeSlot={this.routeSlot} rootRoutes={routes}></RootRoute>
      </RouteContext>
    );
  }

  private unregisterListener?: UnregisterCallback = undefined;
  /** (internal method) sets the routing engine for navigation methods */
  setRouter = (routerHistory: History) => {
    this.routerHistory = routerHistory;

    this.unregisterListener?.();
    this.unregisterListener = routerHistory.listen((...args) => {
      this.routeChangeListener.values().forEach((listener) => listener(...args));
    });
  };

  /** decides how navigation is stored and applied.
   * Url - updates the `window.location.pathname`.
   * Hash - updates `window.location.hash`.
   * InMemory - store state internally and don't update the browser.
   */
  setRoutingMode(routing: Routing) {
    this.routingMode = routing;
  }

  /**
   * register a new route.
   */
  register(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  registerListener(listener: LocationListener) {
    this.routeChangeListener.register(listener);
  }

  /**
   * change browser location
   */
  navigateTo = (
    /** destination */
    path: string,
    state?: Record<string, any>
  ) => {
    this.routerHistory?.push(path, state);
  };

  static slots = [Slot.withType<RouteProps>(), Slot.withType<LocationListener>()];
  static runtime = UIRuntime;

  static async provider(deps, config, [routeSlot, routeChangeSlot]: [RouteSlot, RouteChangeSlot]) {
    return new ReactRouterUI(routeSlot, routeChangeSlot);
  }
}

ReactRouterAspect.addRuntime(ReactRouterUI);
