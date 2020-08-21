import React from 'react';
import { Slot } from '@teambit/harmony';
import { RouteProps } from 'react-router-dom';
import { Workspace } from './ui';
import { RouteSlot } from '../react-router';
import { UIRootUI as UIRoot } from '../ui';
import { UiUI, UIAspect } from '../ui';
import { ComponentUI, ComponentAspect } from '../component';
import { WorkspaceAspect } from './workspace.aspect';
import { UIRuntime } from '../ui';

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
      children: this.componentUi.getComponentUI(WorkspaceAspect.id),
    });

    this.menuSlot.register({
      path: this.componentUi.routePath,
      children: this.componentUi.getMenu(WorkspaceAspect.id),
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

  static dependencies = [UIAspect, ComponentAspect];

  static runtime = UIRuntime;

  static slots = [Slot.withType<RouteProps>(), Slot.withType<RouteProps>()];

  static async provider([ui, componentUi]: [UiUI, ComponentUI], config, [routeSlot, menuSlot]: [RouteSlot, RouteSlot]) {
    const workspaceUI = new WorkspaceUI(routeSlot, componentUi, menuSlot);
    ui.registerRoot(workspaceUI.root);

    return workspaceUI;
  }
}

export default WorkspaceUI;

WorkspaceAspect.addRuntime(WorkspaceUI);
