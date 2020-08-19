import React from 'react';
import { Slot } from '@teambit/harmony';
import { RouteProps } from 'react-router-dom';
import { RouteSlot } from '../react-router';
import { UIRootUI as UIRoot } from '../ui';
import { UIAspect } from '../ui';
import type { UiUI } from '../ui';
import { Scope } from './ui/scope';
import { ComponentAspect } from '../component';
import type { ComponentUI } from '../component';
import { ScopeAspect } from './scope.aspect';

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

  static slots = [Slot.withType<RouteProps>(), Slot.withType<RouteProps>()];

  static async provider([ui, componentUi]: [UiUI, ComponentUI], config, [routeSlot, menuSlot]: [RouteSlot, RouteSlot]) {
    const scopeUi = new ScopeUI(routeSlot, componentUi, menuSlot);
    ui.registerRoot(scopeUi.root);

    return scopeUi;
  }
}

export default ScopeUI;
