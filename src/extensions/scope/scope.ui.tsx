import React from 'react';
import { Slot } from '@teambit/harmony';
import { RouteProps } from 'react-router-dom';
import { RouteSlot } from '../react-router/slot-router';
import { UIRoot } from '../ui/ui-root.ui';
import { UIRuntimeExtension } from '../ui/ui.ui';
import { Scope } from './ui/scope';
import { ComponentUI } from '../component/component.ui';
import { ScopeModel } from './ui/scope-model';

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
    private componentUi: ComponentUI
  ) {}

  /**
   * register a route to the scope.
   */
  registerRoute(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  listComponents = () => {
    return this.scope?.components;
  };

  private scope?: ScopeModel;

  private setScope = (scope?: ScopeModel) => {
    this.scope = scope;
  };

  get root(): UIRoot {
    this.routeSlot.register({
      path: this.componentUi.routePath,
      children: this.componentUi.getComponentUI(ScopeUI.id),
    });

    return {
      routes: [
        {
          path: '/',
          children: <Scope routeSlot={this.routeSlot} onScope={this.setScope} />,
        },
      ],
    };
  }

  static dependencies = [UIRuntimeExtension, ComponentUI];

  // TODO: @gilad we must automate this.
  static id = '@teambit/scope';

  static slots = [Slot.withType<RouteProps>()];

  static async provider([ui, componentUi]: [UIRuntimeExtension, ComponentUI], config, [routeSlot]: [RouteSlot]) {
    const scopeUi = new ScopeUI(routeSlot, componentUi);
    ui.registerRoot(scopeUi.root);

    return scopeUi;
  }
}

export default ScopeUI;
