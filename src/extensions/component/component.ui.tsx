import React from 'react';
import { Route } from 'react-router-dom';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { WorkspaceUI } from '../workspace/workspace.ui';
import { Component } from './ui/component';

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

export type TopBarSlotRegistry = SlotRegistry<MenuItem>;

export class ComponentUI {
  constructor(
    /**
     * top bar slot.
     */
    private topBarSlot: TopBarSlotRegistry
  ) {}

  /**
   * expose the route for a component.
   */
  route() {
    return (
      <Route exact path={`/:id([^~]+)`}>
        <Component topBarSlot={this.topBarSlot} />
      </Route>
    );
  }

  /**
   * register a new menu item.
   */
  registerMenuItem(menuItem: MenuItem) {
    this.topBarSlot.register(menuItem);
    return this;
  }

  static dependencies = [WorkspaceUI];

  static slots = [Slot.withType<MenuItem>()];

  static async provider([workspace]: [WorkspaceUI], config, [topBarSlot]: [TopBarSlotRegistry]) {
    const componentUI = new ComponentUI(topBarSlot);
    workspace.registerRoute(componentUI.route.bind(componentUI));
  }
}
