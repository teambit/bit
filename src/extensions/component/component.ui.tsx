import React from 'react';
import { RouteProps, NavLinkProps } from 'react-router-dom';
import { Slot } from '@teambit/harmony';
import { WorkspaceUI } from '../workspace/workspace.ui';
import { Component } from './ui/component';
import { RouteSlot, NavigationSlot } from '../react-router/slot-router';

export type Server = {
  env: string;
  url: string;
};

export type Component = {
  id: string;
  server: Server;
};

export type MenuItem = {
  label: JSX.Element | string | null;
};

const componentIdUrlRegex = '[\\w\\/-]*[\\w-]';

export class ComponentUI {
  constructor(private routeSlot: RouteSlot, private navSlot: NavigationSlot, private widgetSlot: NavigationSlot) {}

  /**
   * expose the route for a component.
   */
  get componentRoute() {
    return {
      // trailing slash to avoid including '/' in componentId
      path: `/:componentId(${componentIdUrlRegex})/`,
      children: <Component navSlot={this.navSlot} routeSlot={this.routeSlot} widgetSlot={this.widgetSlot} />
    };
  }

  registerRoute(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  registerNavigation(nav: NavLinkProps) {
    this.navSlot.register(nav);
  }
  registerWidget(widget: NavLinkProps) {
    this.widgetSlot.register(widget);
  }

  static dependencies = [WorkspaceUI];

  static slots = [Slot.withType<RouteProps>(), Slot.withType<NavigationSlot>(), Slot.withType<NavigationSlot>()];

  static async provider(
    [workspace]: [WorkspaceUI],
    config,
    [routeSlot, navSlot, widgetSlot]: [RouteSlot, NavigationSlot, NavigationSlot]
  ) {
    const componentUI = new ComponentUI(routeSlot, navSlot, widgetSlot);
    workspace.registerRoute(componentUI.componentRoute);
    return componentUI;
  }
}
