import React from 'react';
import { Slot } from '@teambit/harmony';
import { RouteProps } from 'react-router-dom';
import { RouteSlot } from '@teambit/react-router';
import { UIRootUI as UIRoot } from '@teambit/ui';
import { UIAspect } from '@teambit/ui';
import type { UiUI } from '@teambit/ui';
import { Scope } from './ui/scope';
import { ComponentAspect } from '@teambit/component';
import type { ComponentUI } from '@teambit/component';
import { ScopeAspect } from './scope.aspect';
import { UIRuntime } from '@teambit/ui';

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
    private menuSlot: RouteSlot
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
          children: <Scope routeSlot={this.routeSlot} menuSlot={this.menuSlot} />,
        },
      ],
    };
  }

  static dependencies = [UIAspect, ComponentAspect];

  static runtime = UIRuntime;

  static slots = [Slot.withType<RouteProps>(), Slot.withType<RouteProps>()];

  static async provider([ui, componentUi]: [UiUI, ComponentUI], config, [routeSlot, menuSlot]: [RouteSlot, RouteSlot]) {
    const scopeUi = new ScopeUI(routeSlot, componentUi, menuSlot);
    ui.registerRoot(scopeUi.root);

    return scopeUi;
  }
}

export default ScopeUI;

ScopeAspect.addRuntime(ScopeUI);
