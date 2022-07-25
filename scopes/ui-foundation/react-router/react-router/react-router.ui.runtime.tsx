import React, { ReactNode } from 'react';
import { NavigateFunction } from 'react-router-dom';
import type { Location, NavigationType, RouteProps } from 'react-router-dom';
import { Slot, SlotRegistry } from '@teambit/harmony';
import type { RenderPlugin } from '@teambit/react.rendering.ssr';
import { UIRuntime } from '@teambit/ui';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';

import { ReactRouterAspect } from './react-router.aspect';
import { RouteContext, RootRoute } from './route-context';
import { Routing } from './routing-method';
import { LocationHooks } from './LocationHooks';

export type LocationListener = (location: Location, action: NavigationType) => void;
type RouteChangeSlot = SlotRegistry<LocationListener>;
type RenderContext = { initialLocation?: string };

export class ReactRouterUI {
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
  renderRoutes(routes: RouteProps[]) {
    return <RootRoute routeSlot={this.routeSlot} rootRoutes={routes} />;
  }

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
    path: Location | string,
    /** history action to execute (pop / push / replace) */
    action?: NavigationType
  ) => {
    const state = typeof path !== 'string' ? path.state : undefined;

    switch (action) {
      case 'POP':
        return; // TBD;
      case 'REPLACE':
        this.navigate?.(path, { replace: true, state });
        return;
      case 'PUSH':
      default:
        this.navigate?.(path, { state });
    }
  };

  private navigate?: NavigateFunction = undefined;

  private handleLocationChange = (location: Location, action: NavigationType) => {
    const listeners = this.routeChangeListener.values();
    listeners.forEach((listener) => listener(location, action));
  };

  private RoutingContext = ({ children, renderCtx }: { children: ReactNode; renderCtx?: RenderContext }) => {
    return (
      <RouteContext reactRouterUi={this} routing={this.routingMode} location={renderCtx?.initialLocation}>
        {children}
        <LocationHooks
          onLocationChange={this.handleLocationChange}
          onNavigatorChange={(nav) => (this.navigate = nav)}
        />
      </RouteContext>
    );
  };

  private ServerRouting = ({ children, renderCtx }: { children: ReactNode; renderCtx?: RenderContext }) => {
    return (
      <RouteContext reactRouterUi={this} routing={Routing.static} location={renderCtx?.initialLocation}>
        {children}
        <LocationHooks
          onLocationChange={this.handleLocationChange}
          onNavigatorChange={(nav) => (this.navigate = nav)}
        />
      </RouteContext>
    );
  };

  public renderPlugin: RenderPlugin<RenderContext> = {
    browserInit: () => {
      const initialLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      return { initialLocation };
    },
    serverInit: ({ browser }) => {
      const initialLocation = browser?.location.url;
      return { initialLocation };
    },
    reactClientContext: this.RoutingContext,
    reactServerContext: this.ServerRouting,
  };

  static slots = [Slot.withType<RouteProps>(), Slot.withType<LocationListener>()];
  static runtime = UIRuntime;

  static async provider(deps, config, [routeSlot, routeChangeSlot]: [RouteSlot, RouteChangeSlot]) {
    return new ReactRouterUI(routeSlot, routeChangeSlot);
  }
}

ReactRouterAspect.addRuntime(ReactRouterUI);
