import React, { ReactNode } from 'react';
import { RouteProps } from 'react-router-dom';
import { History, UnregisterCallback, LocationListener, LocationDescriptor, Action } from 'history';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { RenderPlugins, UIRuntime } from '@teambit/ui';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { isBrowser } from '@teambit/ui-foundation.ui.is-browser';

import { ReactRouterAspect } from './react-router.aspect';
import { RouteContext, RootRoute } from './route-context';
import { Routing } from './routing-method';

type RouteChangeSlot = SlotRegistry<LocationListener>;
type RenderContext = { initialLocation?: string };

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
  renderRoutes(routes: RouteProps[]) {
    return <RootRoute routeSlot={this.routeSlot} rootRoutes={routes} />;
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
    /** history action to execute (pop / push / replace) */
    action?: Action
  ) => {
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

  private AppRoutingContext = ({ children, renderCtx }: { children: ReactNode; renderCtx?: RenderContext }) => {
    return (
      <RouteContext reactRouterUi={this} routing={this.routingMode} location={renderCtx?.initialLocation}>
        {children}
      </RouteContext>
    );
  };

  public renderPlugin: RenderPlugins<RenderContext> = {
    browserInit: () => {
      const initialLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      return { initialLocation };
    },
    serverInit: ({ browser }) => {
      const initialLocation = browser?.location.url;
      return { initialLocation };
    },
    reactContext: this.AppRoutingContext,
  };

  static slots = [Slot.withType<RouteProps>(), Slot.withType<LocationListener>()];
  static runtime = UIRuntime;

  static async provider(deps, config, [routeSlot, routeChangeSlot]: [RouteSlot, RouteChangeSlot]) {
    return new ReactRouterUI(routeSlot, routeChangeSlot);
  }
}

ReactRouterAspect.addRuntime(ReactRouterUI);
