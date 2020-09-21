import { ComponentAspect, ComponentUI, ComponentModel } from '@teambit/component';
import { ComponentTreeAspect, ComponentTreeUI, ComponentTreeNode } from '@teambit/component-tree';
import { Slot, SlotRegistry } from '@teambit/harmony';
import ReactRouterAspect, { RouteSlot, ReactRouterUI } from '@teambit/react-router';
import SidebarAspect, { SidebarUI } from '@teambit/sidebar';
import { UIAspect, UIRootUI as UIRoot, UIRuntime, UiUI } from '@teambit/ui';
import React from 'react';
import { RouteProps } from 'react-router-dom';
import CommandBarAspect, { CommandBarUI, ComponentSearcher } from '@teambit/command-bar';
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

    private sidebar: SidebarUI,

    private sidebarSlot: SidebarWidgetSlot,

    private commandBarUI: CommandBarUI,

    reactRouterUI: ReactRouterUI
  ) {
    this.registerExplicitRoutes();
    this.componentSearcher = new ComponentSearcher(reactRouterUI.navigateTo);
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

  registerSidebarWidget(componentTreeNode: ComponentTreeNode) {
    this.sidebarSlot.register(componentTreeNode);
    return this;
  }

  setComponents = (components: ComponentModel[]) => {
    this.componentSearcher.update(components);
  };

  componentSearcher: ComponentSearcher;

  uiRoot(): UIRoot {
    this.sidebar.registerDrawer(new WorkspaceComponentsDrawer(this.sidebarSlot));
    this.commandBarUI.addSearcher(this.componentSearcher);

    return {
      routes: [
        {
          path: '/',
          children: (
            <Workspace
              menuSlot={this.menuSlot}
              routeSlot={this.routeSlot}
              sidebar={<this.sidebar.render />}
              workspaceUI={this}
            />
          ),
        },
      ],
    };
  }

  static dependencies = [
    UIAspect,
    ComponentAspect,
    SidebarAspect,
    ComponentTreeAspect,
    CommandBarAspect,
    ReactRouterAspect,
  ];

  static runtime = UIRuntime;

  static slots = [Slot.withType<RouteProps>(), Slot.withType<RouteProps>(), Slot.withType<ComponentTreeNode>()];

  static async provider(
    [ui, componentUi, sidebar, componentTree, commandBarUI, reactRouterUI]: [
      UiUI,
      ComponentUI,
      SidebarUI,
      ComponentTreeUI,
      CommandBarUI,
      ReactRouterUI
    ],
    config,
    [routeSlot, menuSlot, sidebarSlot]: [RouteSlot, RouteSlot, SidebarWidgetSlot]
  ) {
    componentTree.registerTreeNode(new ComponentTreeWidget());
    sidebarSlot.register(new ComponentTreeWidget());

    const workspaceUI = new WorkspaceUI(
      routeSlot,
      componentUi,
      menuSlot,
      sidebar,
      sidebarSlot,
      commandBarUI,
      reactRouterUI
    );
    ui.registerRoot(workspaceUI.uiRoot.bind(workspaceUI));

    return workspaceUI;
  }
}

export default WorkspaceUI;

WorkspaceAspect.addRuntime(WorkspaceUI);
