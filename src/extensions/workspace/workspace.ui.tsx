import React from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { RouteProps, Route } from 'react-router-dom';
import { Workspace } from './ui';
import { ReactRouterUI, RouteType, RouteSlotRegistry } from '../react-router/react-router.ui';

export type MenuItem = {
  label: JSX.Element | string | null;
};

export type PageRoute = RouteProps;

export type TopBarSlotRegistry = SlotRegistry<MenuItem>;
export type PageSlotRegistry = SlotRegistry<RouteProps>;

export class WorkspaceUI {
  constructor(
    /**
     * top bar slot.
     */
    private topBarSlot: TopBarSlotRegistry,
    /**
     * page slot.
     */
    private pageSlot: PageSlotRegistry,

    /**
     * route slot.
     */
    private routeSlot: RouteSlotRegistry
  ) {}

  setStage?: React.Dispatch<React.SetStateAction<JSX.Element | undefined>>;

  /**
   * register a new menu item.
   */
  registerMenuItem(menuItem: MenuItem) {
    this.topBarSlot.register(menuItem);
    return this;
  }

  registerPage(pageRoute: PageRoute) {
    this.pageSlot.register(pageRoute);
    return this;
  }

  /** set content to appear in main stage */
  open(element: JSX.Element) {
    this.setStage && this.setStage(element);
  }

  /**
   * register a route to the workspace.
   */
  registerRoute(route: RouteType) {
    this.routeSlot.register(route);
    return this;
  }

  route() {
    return (
      <Route path="/">
        <Workspace topBarSlot={this.topBarSlot} pageSlot={this.pageSlot} routeSlot={this.routeSlot} />
      </Route>
    );
  }

  static dependencies = [ReactRouterUI];

  static slots = [Slot.withType<MenuItem>(), Slot.withType<JSX.Element>(), Slot.withType<RouteType>()];

  static async provider(
    [router]: [ReactRouterUI],
    config,
    [topBarSlot, pageSlot, routeSlot]: [TopBarSlotRegistry, PageSlotRegistry, RouteSlotRegistry]
  ) {
    const workspaceUI = new WorkspaceUI(topBarSlot, pageSlot, routeSlot);
    router.register(workspaceUI.route.bind(workspaceUI));
    return workspaceUI;
  }
}
