import React from 'react';
import { Slot } from '@teambit/harmony';
import { RouteProps } from 'react-router-dom';
import { RouteSlot } from '@teambit/react-router';
import { UIRootUI as UIRoot } from '@teambit/ui';
import { UiUI, UIAspect } from '@teambit/ui';
import { UIRuntime } from '@teambit/ui';
import { ComponentUI, ComponentAspect } from '@teambit/component';
import SidebarAspect, { SidebarUI } from '@teambit/sidebar';
import { ComponentTreeAspect, ComponentTreeUI } from '@teambit/component-tree';
import { WorkspaceAspect } from './workspace.aspect';
import { Workspace } from './ui';
import { ComponentTreeWidget } from './component-tree.widget';

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
    private menuSlot: RouteSlot,

    private sidebar: SidebarUI
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
          children: <Workspace menuSlot={this.menuSlot} routeSlot={this.routeSlot} sidebar={<this.sidebar.render />} />,
        },
      ],
    };
  }

  static dependencies = [UIAspect, ComponentAspect, SidebarAspect, ComponentTreeAspect];

  static runtime = UIRuntime;

  static slots = [Slot.withType<RouteProps>(), Slot.withType<RouteProps>()];

  static async provider(
    [ui, componentUi, sidebar, componentTree]: [UiUI, ComponentUI, SidebarUI, ComponentTreeUI],
    config,
    [routeSlot, menuSlot]: [RouteSlot, RouteSlot]
  ) {
    componentTree.registerTreeNode(new ComponentTreeWidget());
    const workspaceUI = new WorkspaceUI(routeSlot, componentUi, menuSlot, sidebar);
    ui.registerRoot(workspaceUI.root);

    return workspaceUI;
  }
}

export default WorkspaceUI;

WorkspaceAspect.addRuntime(WorkspaceUI);
