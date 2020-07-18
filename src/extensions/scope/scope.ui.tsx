import React from 'react';
import { Slot } from '@teambit/harmony';
import { RouteProps } from 'react-router-dom';
import { RouteSlot } from '../react-router/slot-router';
import { UIRoot } from '../ui/ui-root.ui';
import { UIRuntimeExtension } from '../ui/ui.ui';
import { Scope } from './ui/scope';

export type MenuItem = {
  label: JSX.Element | string | null;
};

export class ScopeUI {
  constructor(
    /**
     * route slot.
     */
    private routeSlot: RouteSlot
  ) {}

  /**
   * register a route to the scope.
   */
  registerRoute(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  get root(): UIRoot {
    return {
      component: <Scope routeSlot={this.routeSlot} />,
    };
  }

  static dependencies = [UIRuntimeExtension];

  // TODO: @gilad we must automate this.
  static id = '@teambit/scope';

  static slots = [Slot.withType<RouteProps>()];

  static async provider([ui]: [UIRuntimeExtension], config, [routeSlot]: [RouteSlot]) {
    const scopeUi = new ScopeUI(routeSlot);
    ui.registerRoot(scopeUi.root);

    return scopeUi;
  }
}
