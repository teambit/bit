import React from 'react';
import { RouteProps } from 'react-router-dom';
import { History, UnregisterCallback, LocationListener, LocationDescriptor, Action } from 'history';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { isBrowser } from '@teambit/ui-foundation.ui.is-browser';

import { ReactRouterAspect } from './react-router.aspect';
import { RouteContext, RootRoute } from './route-context';
import { Routing } from './routing-method';

type RouteChangeSlot = SlotRegistry<LocationListener>;
type RenderRoutesOptions = {
  initialLocation?: string;
};

export class ReactRouterUI {
  private routerHistory?: History;
  private routingMode = isBrowser ? Routing.url : Routing.static;

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
  renderRoutes(routes: RouteProps[], options: RenderRoutesOptions = {}): JSX.Element {
    return (
      <RouteContext reactRouterUi={this} routing={this.routingMode} location={options.initialLocation}>
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
    path: LocationDescriptor,
    /**
     * type of history action to execute (pop / push / replace).
     * Supports state-object for legacy calls. (this will be removed when supported by symphony)
     */
    action?: Action | Record<string, any>
  ) => {
    if (typeof action !== 'string') {
      this.legacyNavigateTo(path as string, action);
      return;
    }

    switch (action) {
      case 'POP':
        return; // TBD;
      case 'REPLACE':
        this.routerHistory?.replace(path);
        return;
      case 'PUSH':
      default:
        this.routerHistory?.push(path);
    }
  };

  /**
   * change browser location
   */
  private legacyNavigateTo = (
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
