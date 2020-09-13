import type { ComponentUI, ComponentModel } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { Slot, SlotRegistry } from '@teambit/harmony';
import ReactRouterAspect, { RouteSlot, ReactRouterUI } from '@teambit/react-router';
import { SidebarAspect, SidebarUI } from '@teambit/sidebar';
import { ComponentTreeNode } from '@teambit/component-tree';
import { UIAspect, UIRootUI as UIRoot, UIRuntime, UiUI } from '@teambit/ui';
import React from 'react';
import { RouteProps } from 'react-router-dom';
import CommandBarAspect, { CommandBarUI, ComponentSearcher } from '@teambit/command-bar';
import { ScopeAspect } from './scope.aspect';
import { Scope } from './ui/scope';
import { ComponentsDrawer } from './components.drawer';

export type MenuItem = {
  label: JSX.Element | string | null;
};

export type SidebarSlot = SlotRegistry<ComponentTreeNode>;

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

    private sidebarSlot: SidebarSlot,

    private commandBarUI: CommandBarUI,

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

  uiRoot(): UIRoot {
    this.sidebar.registerDrawer(new ComponentsDrawer(this.sidebarSlot));
    this.commandBarUI.addSearcher(this.componentSearcher);

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
  static slots = [Slot.withType<RouteProps>(), Slot.withType<RouteProps>(), Slot.withType<ComponentTreeNode>()];

  static async provider(
    [ui, componentUi, sidebar, commandBarUI, reactRouterUI]: [
      UiUI,
      ComponentUI,
      SidebarUI,
      CommandBarUI,
      ReactRouterUI
    ],
    config,
    [routeSlot, menuSlot, sidebarSlot]: [RouteSlot, RouteSlot, SidebarSlot]
  ) {
    const scopeUi = new ScopeUI(routeSlot, componentUi, menuSlot, sidebar, sidebarSlot, commandBarUI, reactRouterUI);
    ui.registerRoot(scopeUi.uiRoot.bind(scopeUi));

    return scopeUi;
  }
}

export default ScopeUI;

ScopeAspect.addRuntime(ScopeUI);
