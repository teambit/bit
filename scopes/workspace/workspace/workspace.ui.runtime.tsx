import type { ComponentUI, ComponentModel } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { compact, flatten } from 'lodash';
import type { ComponentTreeUI, ComponentTreeNode } from '@teambit/component-tree';
import { ComponentTreeAspect } from '@teambit/component-tree';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import type { MenuWidgetSlot, MenuWidget } from '@teambit/ui-foundation.ui.menu';
import type { SidebarUI, SidebarItem, SidebarItemSlot } from '@teambit/sidebar';
import { SidebarAspect } from '@teambit/sidebar';
import type { MenuItemSlot, MenuItem } from '@teambit/ui-foundation.ui.main-dropdown';
import type { UIRootUI as UIRoot, UiUI } from '@teambit/ui';
import { UIAspect, UIRuntime } from '@teambit/ui';
import type { GraphUI } from '@teambit/graph';
import { GraphAspect } from '@teambit/graph';
import type { ReactNode } from 'react';
import React from 'react';
import type { RouteProps } from 'react-router-dom';
import type { CommandBarUI, CommandHandler } from '@teambit/command-bar';
import { CommandBarAspect } from '@teambit/command-bar';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import type { ComponentFilters } from '@teambit/component.ui.component-filters.component-filter-context';
import { DeprecateFilter } from '@teambit/component.ui.component-filters.deprecate-filter';
import { EnvsFilter } from '@teambit/component.ui.component-filters.env-filter';
import { ShowMainFilter } from '@teambit/component.ui.component-filters.show-main-filter';
import type { DrawerWidgetSlot, ComponentFiltersSlot } from '@teambit/component.ui.component-drawer';
import { FilterWidget, TreeToggleWidget } from '@teambit/component.ui.component-drawer';
import { ComponentTreeWidget } from './component-tree.widget';
import { Workspace, WorkspaceMenu } from './ui';
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

    private commandBarUI: CommandBarUI,

    private menuWidgetSlot: MenuWidgetSlot
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

  registerMenuWidget = (menuWidgets: MenuWidget[]) => {
    this.menuWidgetSlot.register(menuWidgets);
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
              sidebar={<this.sidebar.render items={this.listSidebarItems()} />}
              workspaceUI={this}
              onSidebarTogglerChange={this.setKeyBindHandler}
            />
          ),
        },
      ],
    };
  }

  listSidebarItems() {
    const items = flatten(this.sidebarItemSlot.values());
    return compact(
      items.map((item) => {
        return item.component;
      })
    );
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
    Slot.withType<MenuWidgetSlot>(),
  ];

  static async provider(
    [ui, componentUi, sidebar, componentTree, commandBarUI, graphUI]: [
      UiUI,
      ComponentUI,
      SidebarUI,
      ComponentTreeUI,
      CommandBarUI,
      GraphUI,
    ],
    config,
    [
      routeSlot,
      menuSlot,
      menuItemSlot,
      sidebarSlot,
      sidebarItemSlot,
      drawerWidgetSlot,
      drawerComponentsFiltersSlot,
      menuWidgetSlot,
    ]: [
      RouteSlot,
      RouteSlot,
      MenuItemSlot,
      SidebarWidgetSlot,
      SidebarItemSlot,
      DrawerWidgetSlot,
      ComponentFiltersSlot,
      MenuWidgetSlot,
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
      commandBarUI,
      menuWidgetSlot
    );

    workspaceUI.registerDrawerComponentFilters([DeprecateFilter, EnvsFilter, ShowMainFilter(true)]);
    workspaceUI.registerDrawerWidgets([
      <FilterWidget key={'workspace-filter-widget'} />,
      <TreeToggleWidget key={'workspace-tree-toggle-widget'} />,
    ]);
    ui.registerRoot(workspaceUI.uiRoot.bind(workspaceUI));
    workspaceUI.registerMenuItem(workspaceUI.menuItems);

    workspaceUI.registerSidebarLink({
      component: function Gallery() {
        return (
          <MenuLinkItem exact href="/" icon="comps">
            Workspace overview
          </MenuLinkItem>
        );
      },
    });

    workspaceUI.registerMenuRoutes([
      {
        path: '/',
        element: <WorkspaceMenu menuItemSlot={workspaceUI.menuItemSlot} widgetSlot={workspaceUI.menuWidgetSlot} />,
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

    workspaceUI.registerMenuWidget([commandBarUI.CommandBarButton]);

    return workspaceUI;
  }
}

export default WorkspaceUI;

WorkspaceAspect.addRuntime(WorkspaceUI);
