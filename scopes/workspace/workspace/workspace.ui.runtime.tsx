import { ComponentAspect, ComponentUI, ComponentModel } from '@teambit/component';
import { ComponentTreeAspect, ComponentTreeUI, ComponentTreeNode } from '@teambit/component-tree';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { Menu } from '@teambit/ui-foundation.ui.menu';
import SidebarAspect, { SidebarUI, SidebarItem, SidebarItemSlot } from '@teambit/sidebar';
import { MenuItemSlot, MenuItem } from '@teambit/ui-foundation.ui.main-dropdown';
import { UIAspect, UIRootUI as UIRoot, UIRuntime, UiUI } from '@teambit/ui';
import { GraphAspect, GraphUI } from '@teambit/graph';
import React, { ReactNode } from 'react';
import { RouteProps } from 'react-router-dom';
import CommandBarAspect, { CommandBarUI, CommandHandler } from '@teambit/command-bar';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { ComponentFilters, DeprecateFilter, EnvsFilter } from '@teambit/component.ui.component-filters';
import {
  DrawerWidgetSlot,
  FilterWidget,
  TreeToggleWidget,
  ComponentFiltersSlot,
} from '@teambit/component.ui.component-drawer';
import { ComponentTreeWidget } from './component-tree.widget';
import { Workspace } from './ui';
import { WorkspaceAspect } from './workspace.aspect';
import { workspaceDrawer } from './workspace.ui.drawer';

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

    private menuItemSlot: MenuItemSlot,

    private sidebar: SidebarUI,

    private sidebarSlot: SidebarWidgetSlot,

    /**
     * sidebar link slot
     */
    private sidebarItemSlot: SidebarItemSlot,

    private drawerWidgetSlot: DrawerWidgetSlot,

    private drawerComponentsFiltersSlot: ComponentFiltersSlot,

    private commandBarUI: CommandBarUI
  ) {}

  private setKeyBindHandler: (updated: CommandHandler) => void = () => {};

  /**
   * register a route to the workspace.
   */
  registerRoutes(routes: RouteProps[]) {
    this.routeSlot.register(routes);
    return this;
  }

  registerDrawers(...drawers: DrawerType[]) {
    this.sidebar.registerDrawer(...drawers);
    return this;
  }

  registerSidebarWidget(componentTreeNode: ComponentTreeNode) {
    this.sidebarSlot.register(componentTreeNode);
    return this;
  }

  registerMenuItem = (menuItems: MenuItem[]) => {
    this.menuItemSlot.register(menuItems);
  };

  registerMenuRoutes = (routes: RouteProps[]) => {
    this.menuSlot.register(routes);
    return this;
  };

  setComponents = (components: ComponentModel[]) => {
    this.componentUi.updateComponents(components);
  };

  registerSidebarLink = (...links: SidebarItem[]) => {
    this.sidebarItemSlot.register(links);
  };

  /**
   * register component filters
   */
  registerDrawerComponentFilters = (filters: ComponentFilters) => {
    this.drawerComponentsFiltersSlot.register(filters);
  };

  registerDrawerWidgets = (widgets: ReactNode[]) => {
    this.drawerWidgetSlot.register(widgets);
  };

  uiRoot(): UIRoot {
    this.registerDrawers(
      workspaceDrawer({
        treeWidgets: this.sidebarSlot,
        drawerWidgetSlot: this.drawerWidgetSlot,
        filtersSlot: this.drawerComponentsFiltersSlot,
      })
    );

    const [setKeyBindHandler] = this.commandBarUI.addCommand({
      id: 'sidebar.toggle', // TODO - extract to a component!
      action: () => {},
      displayName: 'Toggle component list',
      keybinding: 'alt+s',
    });
    this.setKeyBindHandler = setKeyBindHandler;

    return {
      routes: [
        {
          path: '/*',
          element: (
            <Workspace
              menuSlot={this.menuSlot}
              routeSlot={this.routeSlot}
              sidebar={<this.sidebar.render itemSlot={this.sidebarItemSlot} />}
              workspaceUI={this}
              onSidebarTogglerChange={this.setKeyBindHandler}
            />
          ),
        },
      ],
    };
  }

  private menuItems: MenuItem[] = [
    {
      category: 'general',
      title: 'Open command bar',
      keyChar: 'mod+k',
      handler: () => this.commandBarUI?.run('command-bar.open'),
    },
    {
      category: 'general',
      title: 'Toggle component list',
      keyChar: 'alt+s',
      handler: () => this.commandBarUI?.run('sidebar.toggle'),
    },
  ];

  static dependencies = [UIAspect, ComponentAspect, SidebarAspect, ComponentTreeAspect, CommandBarAspect, GraphAspect];

  static runtime = UIRuntime;

  static slots = [
    Slot.withType<RouteProps>(),
    Slot.withType<RouteProps>(),
    Slot.withType<ComponentTreeNode>(),
    Slot.withType<MenuItemSlot>(),
    Slot.withType<SidebarItemSlot>(),
    Slot.withType<DrawerWidgetSlot>(),
    Slot.withType<ComponentFiltersSlot>(),
  ];

  static async provider(
    [ui, componentUi, sidebar, componentTree, commandBarUI, graphUI]: [
      UiUI,
      ComponentUI,
      SidebarUI,
      ComponentTreeUI,
      CommandBarUI,
      GraphUI
    ],
    config,
    [routeSlot, menuSlot, menuItemSlot, sidebarSlot, sidebarItemSlot, drawerWidgetSlot, drawerComponentsFiltersSlot]: [
      RouteSlot,
      RouteSlot,
      MenuItemSlot,
      SidebarWidgetSlot,
      SidebarItemSlot,
      DrawerWidgetSlot,
      ComponentFiltersSlot
    ]
  ) {
    componentTree.registerTreeNode(new ComponentTreeWidget());
    sidebarSlot.register(new ComponentTreeWidget());
    graphUI.registerComponentWidget(new ComponentTreeWidget().widget);

    const workspaceUI = new WorkspaceUI(
      routeSlot,
      componentUi,
      menuSlot,
      menuItemSlot,
      sidebar,
      sidebarSlot,
      sidebarItemSlot,
      drawerWidgetSlot,
      drawerComponentsFiltersSlot,
      commandBarUI
    );

    workspaceUI.registerDrawerComponentFilters([DeprecateFilter, EnvsFilter]);
    workspaceUI.registerDrawerWidgets([
      <FilterWidget key={'workspace-filter-widget'} />,
      <TreeToggleWidget key={'workspace-tree-toggle-widget'} />,
    ]);
    ui.registerRoot(workspaceUI.uiRoot.bind(workspaceUI));
    workspaceUI.registerMenuItem(workspaceUI.menuItems);

    workspaceUI.registerSidebarLink(() => (
      <MenuLinkItem exact href="/" icon="comps">
        Gallery
      </MenuLinkItem>
    ));

    workspaceUI.registerMenuRoutes([
      {
        path: '/',
        element: <Menu menuItemSlot={workspaceUI.menuItemSlot} />,
      },
      {
        path: workspaceUI.componentUi.routePath,
        element: workspaceUI.componentUi.getMenu(WorkspaceAspect.id),
      },
    ]);

    workspaceUI.registerRoutes([
      {
        path: workspaceUI.componentUi.routePath,
        element: workspaceUI.componentUi.getComponentUI(WorkspaceAspect.id),
      },
    ]);

    return workspaceUI;
  }
}

export default WorkspaceUI;

WorkspaceAspect.addRuntime(WorkspaceUI);
