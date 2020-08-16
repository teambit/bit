import React from 'react';
import { Slot } from '@teambit/harmony';
import { RouteProps } from 'react-router-dom';
import { RouteSlot } from '../react-router/slot-router';
import { UIRoot } from '../ui/ui-root.ui';
import { UIRuntimeExtension } from '../ui/ui.ui';
import { Scope } from './ui/scope';
import { SidebarUI } from '../sidebar/sidebar.ui';
import { ComponentUI } from '../component/component.ui';
import { ExternalComponentTreeDrawer } from '../component/external-component-tree';

export type MenuItem = {
  label: JSX.Element | string | null;
};

export class ScopeUI {
  constructor(
    /**
     * route slot.
     */
    private routeSlot: RouteSlot,

    /**
     * component ui extension.
     */
    private componentUi: ComponentUI,
    /**
     * menu slot
     */
    private menuSlot: RouteSlot,

    private sidebar: SidebarUI
  ) {
    this.registerExplicitRoutes();
  }

  /**
   * register a route to the scope.
   */
  registerRoute(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  private registerExplicitRoutes() {
    this.routeSlot.register({
      path: this.componentUi.routePath,
      children: this.componentUi.getComponentUI(ScopeUI.id),
    });

    this.menuSlot.register({
      path: this.componentUi.routePath,
      children: this.componentUi.getMenu(ScopeUI.id),
    });
  }

  get root(): UIRoot {
    return {
      routes: [
        {
          path: '/',
          children: <Scope routeSlot={this.routeSlot} menuSlot={this.menuSlot} sidebar={<this.sidebar.render />} />,
        },
      ],
    };
  }

  static dependencies = [UIRuntimeExtension, ComponentUI, SidebarUI, ExternalComponentTreeDrawer];

  // TODO: @gilad we must automate this.
  static id = '@teambit/scope';

  static slots = [Slot.withType<RouteProps>(), Slot.withType<RouteProps>()];

  static async provider(
    [ui, componentUi, sidebar]: [UIRuntimeExtension, ComponentUI, SidebarUI, ExternalComponentTreeDrawer],
    config,
    [routeSlot, menuSlot]: [RouteSlot, RouteSlot]
  ) {
    const scopeUi = new ScopeUI(routeSlot, componentUi, menuSlot, sidebar);
    ui.registerRoot(scopeUi.root);

    return scopeUi;
  }
}

export default ScopeUI;
