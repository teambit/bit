import React from 'react';
import { Slot } from '@teambit/harmony';
import { RouteProps } from 'react-router-dom';
import { Workspace } from './ui';
import { RouteSlot } from '@teambit/react-router/slot-router';
import { UIRoot } from '@teambit/ui/ui-root.ui';
import { UIRuntimeExtension } from '@teambit/ui/ui.ui';
import ComponentUI from '@teambit/component/component.ui';

export type MenuItem = {
  label: JSX.Element | string | null;
};

export class WorkspaceUI {
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
   * register a route to the workspace.
   */
  registerRoute(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  private registerExplicitRoutes() {
    this.routeSlot.register({
      path: this.componentUi.routePath,
      children: this.componentUi.getComponentUI(WorkspaceUI.id),
    });

    this.menuSlot.register({
      path: this.componentUi.routePath,
      children: this.componentUi.getMenu(WorkspaceUI.id),
    });
  }

  get root(): UIRoot {
    return {
      routes: [
        {
          path: '/',
          children: <Workspace menuSlot={this.menuSlot} routeSlot={this.routeSlot} />,
        },
      ],
    };
  }

  static dependencies = [UIRuntimeExtension, ComponentUI];

  // TODO: @gilad we must automate this.
  static id = '@teambit/workspace';

  static slots = [Slot.withType<RouteProps>(), Slot.withType<RouteProps>()];

  static async provider(
    [ui, componentUi]: [UIRuntimeExtension, ComponentUI],
    config,
    [routeSlot, menuSlot]: [RouteSlot, RouteSlot]
  ) {
    const workspaceUI = new WorkspaceUI(routeSlot, componentUi, menuSlot);
    ui.registerRoot(workspaceUI.root);

    return workspaceUI;
  }
}

export default WorkspaceUI;
