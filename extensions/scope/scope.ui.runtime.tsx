import type { ComponentUI, ComponentModel } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { Slot } from '@teambit/harmony';
import ReactRouterAspect, { RouteSlot, ReactRouterUI } from '@teambit/react-router';
import { SidebarAspect, SidebarUI } from '@teambit/sidebar';
import { UIAspect, UIRootUI as UIRoot, UIRuntime, UiUI } from '@teambit/ui';
import React from 'react';
import { RouteProps } from 'react-router-dom';
import { ComponentSearcher } from '@teambit/component-searcher';
import CommandBarAspect, { CommandBarUI } from '@teambit/command-bar';
import { ScopeAspect } from './scope.aspect';
import { Scope } from './ui/scope';

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
    private sidebar: SidebarUI,
    reactRouterUI: ReactRouterUI
  ) {
    this.registerExplicitRoutes();
    this.componentSearcher = new ComponentSearcher(reactRouterUI.navigateTo);
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
      children: this.componentUi.getComponentUI(ScopeAspect.id),
    });

    this.menuSlot.register({
      path: this.componentUi.routePath,
      children: this.componentUi.getMenu(ScopeAspect.id),
    });
  }

  get root(): UIRoot {
    return {
      routes: [
        {
          path: '/',
          children: (
            <Scope
              routeSlot={this.routeSlot}
              menuSlot={this.menuSlot}
              sidebar={<this.sidebar.render />}
              scopeUi={this}
            />
          ),
        },
      ],
    };
  }

  /** registers available components */
  setComponents = (components: ComponentModel[]) => {
    this.componentSearcher.update(components);
  };

  componentSearcher: ComponentSearcher;

  static dependencies = [UIAspect, ComponentAspect, SidebarAspect, CommandBarAspect, ReactRouterAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<RouteProps>(), Slot.withType<RouteProps>()];

  static async provider(
    [ui, componentUi, sidebar, commandBarUI, reactRouterUI]: [
      UiUI,
      ComponentUI,
      SidebarUI,
      CommandBarUI,
      ReactRouterUI
    ],
    config,
    [routeSlot, menuSlot]: [RouteSlot, RouteSlot]
  ) {
    const scopeUi = new ScopeUI(routeSlot, componentUi, menuSlot, sidebar, reactRouterUI);
    ui.registerRoot(scopeUi.root);
    commandBarUI.addSearcher(scopeUi.componentSearcher);

    return scopeUi;
  }
}

export default ScopeUI;

ScopeAspect.addRuntime(ScopeUI);
