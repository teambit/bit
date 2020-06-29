import React from 'react';
import { Route, RouteProps, NavLinkProps } from 'react-router-dom';
import { Slot, SlotRegistry } from '@teambit/harmony';
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

//WIP
// /^\/?([^./@]+)\/([^./@]+)(\/([^.@]*))$/
const componentIdUrlRegex = '[\\w/-]+';

export class ComponentUI {
  constructor(
    /**
     * top bar slot.
     */
    // private sectionSlot: SectionSlotRegistry,
    private routeSlot: RouteSlot,
    private navSlot: NavigationSlot
  ) {}

  /**
   * expose the route for a component.
   */
  ComponentRoute = () => {
    return (
      <Route path={`/:componentId(${componentIdUrlRegex})`} key={ComponentUI.name}>
        <Component navSlot={this.navSlot} routeSlot={this.routeSlot} />
      </Route>
    );
  };

  registerRoute(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  registerNavigation(nav: NavLinkProps) {
    this.navSlot.register(nav);
  }

  static dependencies = [WorkspaceUI];

  static slots = [Slot.withType<RouteProps>(), Slot.withType<NavigationSlot>()];

  static async provider([workspace]: [WorkspaceUI], config, [routeSlot, navSlot]: [RouteSlot, NavigationSlot]) {
    const componentUI = new ComponentUI(routeSlot, navSlot);
    workspace.registerRoute(() => <componentUI.ComponentRoute key="component-page" />);
    return componentUI;
  }
}
