import React, { useEffect } from 'react';
import { Slot } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import { RouteProps, useHistory } from 'react-router-dom';
import { connectToParent } from 'penpal';
import { Location } from 'history';

import { ReactRouterAspect } from './react-router.aspect';
import { RouteSlot } from './slot-router';
import { RouteContext } from './route-context';

type History = ReturnType<typeof useHistory>;

export class ReactRouterUI {
  private routerHistory?: History;
  private isIframed = typeof window !== 'undefined' && window.parent !== window;
  private parent?: ParentMethods; // TODO

  constructor(
    /**
     * route slot.
     */
    private routeSlot: RouteSlot
  ) {
    if (this.isIframed) setTimeout(this.connectToParent, 300);

    popstateListen();
  }

  /**
   * render all slot routes.
   */
  renderRoutes(routes: RouteProps[]): JSX.Element {
    return <RouteContext routeSlot={this.routeSlot} rootRoutes={routes} reactRouterUi={this} />;
  }

  private listeningToHistory = false;
  /** sets the routing engine for navigation methods (internal method) */
  setRouter: (routerHistory: History) => void = (routerHistory: History): void => {
    this.routerHistory = routerHistory;

    if (!this.listeningToHistory) {
      this.listeningToHistory = true;
      routerHistory.listen(this.handleLocationChange);
    }
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
    path: string
  ) => {
    this.routerHistory?.push(path, { source: 'parent' });
  };

  private handleLocationChange = (nextState: Location, action: string) => {
    // @ts-ignore // TODO
    console.log('[iframe]', 'URL CHANGE', action, nextState);
    if (nextState.state?.source === 'parent') return;
    if (action === 'POP') return; // TODO. not sure its necessary. actually, it's more elegant
    this.parent?.locationChange(nextState);
  };

  private connectToParent = () => {
    const parentConnection = connectToParent<ParentMethods>({
      parentOrigin: /.*bit\.dev$/,
      debug: false,
      methods: {
        // hello: () => {
        //   console.log("hello! I'm in iframe");
        //   return 'iframe-response';
        // },
        navigateTo: this.navigateTo,
      },
    });

    parentConnection.promise
      .then((e) => {
        this.parent = e;
        e.echo('connected!');
      })
      .catch((err) => {
        console.log('[iframe]', 'err', err);
      });
  };

  static slots = [Slot.withType<RouteProps>()];

  static runtime = UIRuntime;

  static async provider(deps, config, [routeSlot]: [RouteSlot]) {
    return new ReactRouterUI(routeSlot);
  }
}

ReactRouterAspect.addRuntime(ReactRouterUI);

type ParentMethods = {
  echo: (data: string) => void;
  locationChange: (e: Location) => void;
};

// function MonitorUrl({ history }: { history: History }) {
//   console.log('[iframe]', 'MonitorUrl()');

//   // window.addEventListener('popstate', (e) => {
//   //   console.log('[iframe]', 'popstate', window.history.length, e);
//   // });

//   history.listen((e, action) => {
//     console.log('[iframe]', 'router history - URL CHANGE', history.length, action, e);
//   });
// }

function popstateListen() {
  window.addEventListener('popstate', (e) => {
    console.debug('[iframe]', 'popstate', window.history.length, e);
  });
}
