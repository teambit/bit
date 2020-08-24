import React from 'react';
import { RouteProps } from 'react-router-dom';
import { Slot } from '@teambit/harmony';
import { NavLinkProps } from '@teambit/react-router';
import { Component } from './ui/component';
import { RouteSlot, NavigationSlot } from '@teambit/react-router';
import { Menu } from './ui/menu';
import { ComponentAspect } from './component.aspect';
import { UIRuntime } from '@teambit/ui';

export type Server = {
  env: string;
  url: string;
};

export type ComponentMeta = {
  id: string;
};

export type MenuItem = {
  label: JSX.Element | string | null;
};

export const componentIdUrlRegex = '[\\w\\/-]*[\\w-]';

export class ComponentUI {
  constructor(
    private routeSlot: RouteSlot,

    private navSlot: NavigationSlot,

    /**
     * slot for registering a new widget to the menu.
     */
    private widgetSlot: NavigationSlot
  ) {}

  readonly routePath = `/:componentId(${componentIdUrlRegex})`;

  getComponentUI(host: string) {
    return <Component routeSlot={this.routeSlot} host={host} />;
  }

  getMenu(host: string) {
    return <Menu navigationSlot={this.navSlot} widgetSlot={this.widgetSlot} host={host} />;
  }
  // getTopBarUI() {
  //   return (
  //     <TopBar
  //       // className={styles.topbar}
  //       navigationSlot={this.navSlot}
  //       version={'new'} // TODO - get component data here
  //       widgetSlot={this.widgetSlot}
  //     />
  //   );
  // }

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

  static dependencies = [];

  static runtime = UIRuntime;

  static slots = [Slot.withType<RouteProps>(), Slot.withType<NavigationSlot>(), Slot.withType<NavigationSlot>()];

  static async provider(deps, config, [routeSlot, navSlot, widgetSlot]: [RouteSlot, NavigationSlot, NavigationSlot]) {
    // TODO: refactor ComponentHost to a separate extension (including sidebar, host, graphql, etc.)
    // TODO: add contextual hook for ComponentHost @uri/@oded
    const componentUI = new ComponentUI(routeSlot, navSlot, widgetSlot);
    return componentUI;
  }
}

export default ComponentUI;

ComponentAspect.addRuntime(ComponentUI);
