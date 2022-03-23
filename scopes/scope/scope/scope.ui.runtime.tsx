import flatten from 'lodash.flatten';
import type { ComponentUI, ComponentModel } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { Slot, SlotRegistry } from '@teambit/harmony';
import ReactRouterAspect, { ReactRouterUI } from '@teambit/react-router';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { SidebarAspect, SidebarUI, SidebarItem, SidebarItemSlot } from '@teambit/sidebar';
import { ComponentTreeNode } from '@teambit/component-tree';
import { UIAspect, UIRootUI as UIRoot, UIRuntime, UiUI } from '@teambit/ui';
import React, { ComponentType, ReactNode } from 'react';
import { MenuItemSlot, MenuItem } from '@teambit/ui-foundation.ui.main-dropdown';
import { RouteProps } from 'react-router-dom';
import { MenuWidget, MenuWidgetSlot } from '@teambit/ui-foundation.ui.menu';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';
import CommandBarAspect, { CommandBarUI, ComponentSearcher, CommandHandler } from '@teambit/command-bar';
import { ScopeModel } from '@teambit/scope.models.scope-model';
import { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import {
  DrawerWidgetSlot,
  FilterWidget,
  TreeToggleWidget,
  ComponentFiltersSlot,
} from '@teambit/component.ui.component-drawer';
import { ComponentFilters, DeprecateFilter, EnvsFilter } from '@teambit/component.ui.component-filters';

import { ScopeMenu, ScopeUseBox } from './ui/menu';
import { ScopeAspect } from './scope.aspect';
import { Scope } from './ui/scope';
import { scopeDrawer } from './scope.ui.drawer';

export type ScopeBadge = ComponentType;

export type ScopeBadgeSlot = SlotRegistry<ScopeBadge[]>;

export type ContextSlot = SlotRegistry<ScopeContextType[]>;

export type ScopeContextType = ComponentType<{ scope: ScopeModel; children: ReactNode }>;

export type SidebarSlot = SlotRegistry<ComponentTreeNode>;

export type ScopeOverview = ComponentType;

export type ScopeOverviewSlot = SlotRegistry<ScopeOverview>;

export type Corner = ComponentType;

export type CornerSlot = SlotRegistry<Corner>;

export type OverviewLine = ComponentType;

export type OverviewLineSlot = SlotRegistry<OverviewLine[]>;

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
    private menuSlot: RouteSlot,

    private sidebar: SidebarUI,

    private sidebarSlot: SidebarSlot,

    private commandBarUI: CommandBarUI,

    private componentSearcher: ComponentSearcher,

    private scopeBadgeSlot: ScopeBadgeSlot,

    private menuWidgetSlot: MenuWidgetSlot,

    /**
     * sidebar link slot
     */
    private sidebarItemSlot: SidebarItemSlot,

    /**
     * main dropdown item slot
     */
    private menuItemSlot: MenuItemSlot,

    /**
     * corner slot
     */
    private cornerSlot: CornerSlot,

    /**
     * overview line slot to add new lines beneath the overview section
     */
    private overviewSlot: OverviewLineSlot,

    /**
     * add a new context to ui
     */
    private contextSlot: ContextSlot,
    private drawerWidgetSlot: DrawerWidgetSlot,
    private drawerComponentsFiltersSlot: ComponentFiltersSlot
  ) {}

  private setSidebarToggle: (updated: CommandHandler) => void = () => {};

  /**
   * register a new badge into the scope overview.
   */
  registerBadge(...badges: ScopeBadge[]) {
    this.scopeBadgeSlot.register(badges);
    return this;
  }

  /**
   * register a new line beneath the scope overview section.
   */
  registerOverviewLine(...lines: OverviewLine[]) {
    this.overviewSlot.register(lines);
    return this;
  }

  /**
   * register a route to the scope.
   */
  registerRoutes(routes: RouteProps[]) {
    this.routeSlot.register(routes);
    return this;
  }

  registerMenuRoutes = (routes: RouteProps[]) => {
    this.menuSlot.register(routes);
    return this;
  };

  private registerExplicitRoutes() {
    this.registerMenuRoutes([
      {
        path: this.componentUi.routePath,
        children: this.componentUi.getMenu(ScopeAspect.id),
      },
      {
        exact: true,
        path: '/',
        children: <ScopeMenu widgetSlot={this.menuWidgetSlot} menuItemSlot={this.menuItemSlot} />,
      },
    ]);
    this.registerRoutes([
      {
        path: this.componentUi.routePath,
        children: this.componentUi.getComponentUI(ScopeAspect.id),
      },
    ]);
  }

  registerMenuWidget(...menuItems: MenuWidget[]) {
    this.menuWidgetSlot.register(menuItems);
  }

  registerCorner(corner: Corner) {
    this.cornerSlot.register(corner);
  }

  /**
   * register a scope overview.
   */
  replaceOverview() {}

  /**
   * register description.
   */
  replaceDescription() {}

  /**
   * register metadata section.
   */
  replaceMetadataSection() {}

  /**
   * register a metadata item.
   */
  registerMetadataItem() {}

  replaceComponentGrid() {}

  /**
   * register metadata.
   */
  registerMetadata() {}

  /**
   * add a new context to the scope.
   */
  addContext(...context: ScopeContextType[]) {
    this.contextSlot.register(context);
    return this;
  }

  private getContext() {
    const contexts = this.contextSlot.values();
    return flatten(contexts);
  }

  registerMenuItem = (menuItems: MenuItem[]) => {
    this.menuItemSlot.register(menuItems);
  };

  /**
   * register a sidebar Widget for the scope
   */
  registerSidebarWidget = (componentTreeNodes: ComponentTreeNode[]) => {
    componentTreeNodes.map((componentTreeNode) => this.sidebarSlot.register(componentTreeNode));
    return this;
  };

  /**
   * register a sidebar link to the section above the drawers
   */
  registerSidebarLink = (...links: SidebarItem[]) => {
    this.sidebarItemSlot.register(links);
  };

  registerDrawers = (...drawer: DrawerType[]) => {
    this.sidebar.registerDrawer(...drawer);
    return this;
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
    this.commandBarUI.addSearcher(this.componentSearcher);
    this.sidebar.registerDrawer(
      scopeDrawer({
        treeWidgets: this.sidebarSlot,
        filtersSlot: this.drawerComponentsFiltersSlot,
        drawerWidgetSlot: this.drawerWidgetSlot,
      })
    );
    const [setKeyBindHandler] = this.commandBarUI.addCommand({
      id: 'sidebar.toggle', // TODO - extract to a component!
      handler: () => {},
      displayName: 'Toggle component list',
      keybinding: 'alt+s',
    });
    this.setSidebarToggle = setKeyBindHandler;

    return {
      routes: [
        {
          path: '/',
          children: (
            <Scope
              routeSlot={this.routeSlot}
              menuSlot={this.menuSlot}
              sidebar={<this.sidebar.render itemSlot={this.sidebarItemSlot} />}
              scopeUi={this}
              badgeSlot={this.scopeBadgeSlot}
              overviewLineSlot={this.overviewSlot}
              context={this.getContext()}
              onSidebarTogglerChange={this.setSidebarToggle}
              cornerSlot={this.cornerSlot}
            />
          ),
        },
      ],
    };
  }

  /** registers available components */
  setComponents = (components: ComponentModel[]) => {
    this.componentSearcher.update(components);
  };

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

  static dependencies = [UIAspect, ComponentAspect, SidebarAspect, CommandBarAspect, ReactRouterAspect];
  static runtime = UIRuntime;
  static slots = [
    Slot.withType<RouteProps>(),
    Slot.withType<RouteProps>(),
    Slot.withType<ComponentTreeNode>(),
    Slot.withType<ScopeBadge>(),
    Slot.withType<ScopeOverview>(),
    Slot.withType<MenuWidget[]>(),
    Slot.withType<MenuItemSlot>(),
    Slot.withType<CornerSlot>(),
    Slot.withType<OverviewLineSlot>(),
    Slot.withType<SidebarItemSlot>(),
    Slot.withType<ContextSlot>(),
    Slot.withType<DrawerWidgetSlot>(),
    Slot.withType<ComponentFiltersSlot>(),
  ];

  static async provider(
    [ui, componentUi, sidebar, commandBarUI, reactRouterUI]: [
      UiUI,
      ComponentUI,
      SidebarUI,
      CommandBarUI,
      ReactRouterUI
    ],
    config,
    [
      routeSlot,
      menuSlot,
      sidebarSlot,
      scopeBadgeSlot,
      menuWidgetSlot,
      menuItemSlot,
      sidebarItemSlot,
      cornerSlot,
      overviewSlot,
      contextSlot,
      drawerWidgetSlot,
      componentFiltersSlot,
    ]: [
      RouteSlot,
      RouteSlot,
      SidebarSlot,
      ScopeBadgeSlot,
      MenuWidgetSlot,
      MenuItemSlot,
      SidebarItemSlot,
      CornerSlot,
      OverviewLineSlot,
      ContextSlot,
      DrawerWidgetSlot,
      ComponentFiltersSlot
    ]
  ) {
    const componentSearcher = new ComponentSearcher(reactRouterUI.navigateTo);
    const scopeUi = new ScopeUI(
      routeSlot,
      componentUi,
      menuSlot,
      sidebar,
      sidebarSlot,
      commandBarUI,
      componentSearcher,
      scopeBadgeSlot,
      menuWidgetSlot,
      sidebarItemSlot,
      menuItemSlot,
      cornerSlot,
      overviewSlot,
      contextSlot,
      drawerWidgetSlot,
      componentFiltersSlot
    );
    scopeUi.registerDrawerComponentFilters([DeprecateFilter, EnvsFilter]);
    scopeUi.registerDrawerWidgets([
      <FilterWidget key={'workspace-filter-widget'} />,
      <TreeToggleWidget key={'workspace-tree-toggle-widget'} />,
    ]);
    ui.registerRoot(scopeUi.uiRoot.bind(scopeUi));
    scopeUi.registerMenuItem(scopeUi.menuItems);
    scopeUi.registerMenuWidget(() => <ScopeUseBox />);
    scopeUi.registerSidebarLink(() => (
      <MenuLinkItem exact href="/" icon="comps">
        Gallery
      </MenuLinkItem>
    ));
    scopeUi.registerExplicitRoutes();

    return scopeUi;
  }
}

export default ScopeUI;

ScopeAspect.addRuntime(ScopeUI);
