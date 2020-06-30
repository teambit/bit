import React from 'react';
import { Slot } from '@teambit/harmony';
import { RouteProps } from 'react-router-dom';
import { Workspace } from './ui';
import { ReactRouterUI } from '../react-router/react-router.ui';
import { RouteSlot } from '../react-router/slot-router';

export type MenuItem = {
  label: JSX.Element | string | null;
};

export class WorkspaceUI {
  constructor(
    /**
     * route slot.
     */
    private routeSlot: RouteSlot
  ) {}

  /**
   * register a route to the workspace.
   */
  registerRoute(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  get workspaceRoute() {
    return {
      path: '/',
      children: <Workspace routeSlot={this.routeSlot} />
    };
  }

  static dependencies = [ReactRouterUI];

  static slots = [Slot.withType<RouteProps>()];

  static async provider([router]: [ReactRouterUI], config, [routeSlot]: [RouteSlot]) {
    const workspaceUI = new WorkspaceUI(routeSlot);

    router.register(workspaceUI.workspaceRoute);

    return workspaceUI;
  }
}
