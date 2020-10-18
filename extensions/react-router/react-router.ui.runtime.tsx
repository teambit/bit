import React from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import { RouteProps } from 'react-router-dom';
import { History, UnregisterCallback, LocationListener } from 'history';

import { ReactRouterAspect } from './react-router.aspect';
import { RouteSlot } from './slot-router';
import { RouteContext, Routing } from './route-context';
import { IframeNavigator } from './parent-navigator';

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
      <RouteContext routeSlot={this.routeSlot} rootRoutes={routes} reactRouterUi={this} routing={this.routingMode} />
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
    const router = new ReactRouterUI(routeSlot, routeChangeSlot);

    const iframeNav = new IframeNavigator(router);
    routeChangeSlot.register(iframeNav.handleLocationChange);
    // @ts-ignore TODO! TEMPORARY
    router.iframeNav = iframeNav;

    return router;
  }
}

ReactRouterAspect.addRuntime(ReactRouterUI);
