import { ComponentAspect, ComponentUI } from '@teambit/component';
import { ComponentTreeAspect, ComponentTreeUI, ComponentTreeNode } from '@teambit/component-tree';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { RouteSlot } from '@teambit/react-router';
import SidebarAspect, { SidebarUI } from '@teambit/sidebar';
import { UIAspect, UIRootUI as UIRoot, UIRuntime, UiUI } from '@teambit/ui';
import React from 'react';
import { RouteProps } from 'react-router-dom';
import { WorkspaceComponentsDrawer } from './workspace-components.drawer';
import { ComponentTreeWidget } from './component-tree.widget';
import { Workspace } from './ui';
import { WorkspaceAspect } from './workspace.aspect';

export type MenuItem = {
  label: JSX.Element | string | null;
};

export type SidebarWidgetSlot = SlotRegistry<ComponentTreeNode>;

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

  static slots = [Slot.withType<RouteProps>(), Slot.withType<RouteProps>(), Slot.withType<ComponentTreeNode>()];

  static async provider(
    [ui, componentUi, sidebar, componentTree]: [UiUI, ComponentUI, SidebarUI, ComponentTreeUI],
    config,
    [routeSlot, menuSlot, sidebarSlot]: [RouteSlot, RouteSlot, SidebarWidgetSlot]
  ) {
    componentTree.registerTreeNode(new ComponentTreeWidget());
    sidebar.registerDrawer(new WorkspaceComponentsDrawer(sidebarSlot));

    const workspaceUI = new WorkspaceUI(routeSlot, componentUi, menuSlot, sidebar);
    ui.registerRoot(workspaceUI.root);

    return workspaceUI;
  }
}

export default WorkspaceUI;

WorkspaceAspect.addRuntime(WorkspaceUI);
