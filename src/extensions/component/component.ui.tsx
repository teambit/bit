import React from 'react';
import { Route, useRouteMatch } from 'react-router-dom';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { WorkspaceUI } from '../workspace/workspace.ui';
import { Component } from './ui/component';
import { Section } from './section/section';

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

export type SectionSlotRegistry = SlotRegistry<Section>;

export class ComponentUI {
  constructor(
    /**
     * top bar slot.
     */
    private sectionSlot: SectionSlotRegistry
  ) {}

  /**
   * expose the route for a component.
   */
  componentRoute() {
    const { url } = useRouteMatch();

    return (
      <Route exact path="*" key={ComponentUI.name}>
        {/* :TODO hack until @uri fixes component routing */}
        {url === '/' ? <Component sectionSlot={this.sectionSlot} /> : <div></div>}
      </Route>
    );
  }

  /**
   * register a new menu item.
   */
  registerSection(section: Section) {
    this.sectionSlot.register(section);
    return this;
  }

  static dependencies = [WorkspaceUI];

  static slots = [Slot.withType<Section>()];

  static async provider([workspace]: [WorkspaceUI], config, [sectionSlot]: [SectionSlotRegistry]) {
    const componentUI = new ComponentUI(sectionSlot);
    workspace.registerRoute(componentUI.componentRoute.bind(componentUI));
    return componentUI;
  }
}
