import React, { useCallback } from 'react';
import { Slot } from '@teambit/harmony';
import { BrowserRouter, RouteProps, useHistory } from 'react-router-dom';
import { History } from 'history';
import { SlotRouter, RouteSlot } from './slot-router';

export class ReactRouterUI {
  constructor(
    /**
     * route slot.
     */
    private routeSlot: RouteSlot
  ) {}

  private history?: History;

  /**
   * render all slot routes.
   */
  renderRoutes = ({ routes }: { routes: RouteProps[] }): JSX.Element => {
    const setHistory = useCallback((history) => {
      if (this.history !== history) this.history = history;
    }, []);

    return (
      <BrowserRouter>
        <GetHistory onHistory={setHistory} />
        <SlotRouter slot={this.routeSlot} rootRoutes={routes} />
      </BrowserRouter>
    );
  };

  /**
   * register a new route.
   */
  register(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  push: History['push'] = (...args: [any]) => {
    return this.history?.push(...args);
  };

  static slots = [Slot.withType<RouteProps>()];

  static async provider(deps, config, [routeSlot]: [RouteSlot]) {
    return new ReactRouterUI(routeSlot);
  }
}

function GetHistory({ onHistory }: { onHistory: (history: History) => void }) {
  const history = useHistory();
  onHistory(history);

  return null;
}
