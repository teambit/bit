import React from 'react';
import { Slot } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import { RouteProps, useHistory } from 'react-router-dom';
import { connectToParent, ErrorCode } from 'penpal';
import type { AsyncMethodReturns } from 'penpal/lib/types';
import { Location, UnregisterCallback } from 'history';

import { ReactRouterAspect } from './react-router.aspect';
import { RouteSlot } from './slot-router';
import { RouteContext, Routing } from './route-context';

type History = ReturnType<typeof useHistory>;
type HistoryState = { iframeSource?: string };
type ParentMethods = {
  changeLocation: (e: Location) => void;
};

const ALLOWED_PARENTS = /.*bit\.dev$/;

export class ReactRouterUI {
  private routerHistory?: History;
  private isIframed = typeof window !== 'undefined' && window.parent !== window;
  private parent?: AsyncMethodReturns<ParentMethods>;

  constructor(
    /**
     * route slot.
     */
    private routeSlot: RouteSlot
  ) {
    if (this.isIframed) setTimeout(this.connectToParent, 300);
  }

  /**
   * render all slot routes.
   */
  renderRoutes(routes: RouteProps[]): JSX.Element {
    const routing = this.isIframed ? Routing.inMemory : Routing.pathname;

    return <RouteContext routeSlot={this.routeSlot} rootRoutes={routes} reactRouterUi={this} routing={routing} />;
  }

  private unregisterListener?: UnregisterCallback = undefined;
  /** (internal method) sets the routing engine for navigation methods */
  setRouter = (routerHistory: History) => {
    this.routerHistory = routerHistory;

    this.unregisterListener?.();
    this.unregisterListener = routerHistory.listen(this.handleLocationChange);
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
    path: string,
    state?: Record<string, any>
  ) => {
    this.routerHistory?.push(path, state);
  };

  private handleLocationChange = (next: Location, action: string) => {
    const state = next.state as HistoryState | undefined;
    if (state?.iframeSource === 'parent') return;
    if (action === 'POP') return; // ignore 'back' and 'forward' changes (handled by parent)

    this.parent?.changeLocation(next);
  };

  private connectionRetries = 3;
  private connectToParent = () => {
    const parentConnection = connectToParent<ParentMethods>({
      parentOrigin: ALLOWED_PARENTS,
      timeout: 800,
      methods: {
        navigateTo: (path: string) => this.navigateTo(path, { iframeSource: 'parent' }),
      },
      // debug: true,
    });

    parentConnection.promise
      .then((e) => (this.parent = e))
      .catch((err: Error & { code: ErrorCode }) => {
        const shouldRetry =
          this.connectionRetries > 0 && [ErrorCode.ConnectionTimeout, ErrorCode.ConnectionDestroyed].includes(err.code);

        if (shouldRetry) {
          this.connectionRetries -= 1;
          setTimeout(this.connectToParent, 300);
        }
      });
  };

  static slots = [Slot.withType<RouteProps>()];

  static runtime = UIRuntime;

  static async provider(deps, config, [routeSlot]: [RouteSlot]) {
    return new ReactRouterUI(routeSlot);
  }
}

ReactRouterAspect.addRuntime(ReactRouterUI);
