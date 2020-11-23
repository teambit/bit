import type { ComponentUI, ComponentModel } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { Slot, SlotRegistry } from '@teambit/harmony';
import ReactRouterAspect, { ReactRouterUI } from '@teambit/react-router';
import { RouteSlot } from '@teambit/ui.react-router.slot-router';
import { SidebarAspect, SidebarUI, SidebarItem, SidebarItemSlot } from '@teambit/sidebar';
import { ComponentTreeNode } from '@teambit/component-tree';
import { UIAspect, UIRootUI as UIRoot, UIRuntime, UiUI } from '@teambit/ui';
import React, { ComponentType, ReactNode } from 'react';
import { MenuItemSlot, MenuItem } from '@teambit/ui.main-dropdown';
import { RouteProps } from 'react-router-dom';
import { MenuWidget, MenuWidgetSlot } from '@teambit/ui.menu';
import { MenuLinkItem } from '@teambit/ui.surfaces.menu.link-item';
import CommandBarAspect, { CommandBarUI, ComponentSearcher, CommandHandler } from '@teambit/command-bar';
import { ScopeMenu } from './ui/menu';
import { ScopeAspect } from './scope.aspect';
import { Scope } from './ui/scope';
import { ScopeModel } from './ui/scope-model';
import { ComponentsDrawer } from './components.drawer';

export type ScopeBadge = ComponentType;

export type ScopeBadgeSlot = SlotRegistry<ScopeBadge[]>;

export type ScopeContextType = ComponentType<{ scope: ScopeModel; children: ReactNode }>;

export type SidebarSlot = SlotRegistry<ComponentTreeNode>;

export type ScopeOverview = ComponentType;

export type ScopeOverviewSlot = SlotRegistry<ScopeOverview>;

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
    private menuItemSlot: MenuItemSlot
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
   * register a route to the scope.
   */
  registerRoute(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  private registerExplicitRoutes() {
    this.routeSlot.register({
      path: this.componentUi.routePath,
      children: this.componentUi.getComponentUI(ScopeAspect.id),
    });

    this.menuSlot.register([
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
  }

  registerMenuWidget(...menuItems: MenuWidget[]) {
    this.menuWidgetSlot.register(menuItems);
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

  private _context: () => ScopeContextType;

  /**
   * add a new context to the scope.
   */
  addContext(context: ScopeContextType) {
    this._context = () => context;
  }

  getContext() {
    if (!this._context) return undefined;
    return this._context();
  }

  registerMenuItem = (menuItems: MenuItem[]) => {
    this.menuItemSlot.register(menuItems);
  };

  /**
   * register a sidebar link to the section above the drawers
   */
  registerSidebarLink = (...links: SidebarItem[]) => {
    this.sidebarItemSlot.register(links);
  };

  uiRoot(): UIRoot {
    this.sidebar.registerDrawer(new ComponentsDrawer(this.sidebarSlot));
    this.commandBarUI.addSearcher(this.componentSearcher);

    const [setKeyBindHandler] = this.commandBarUI.addCommand({
      id: 'sidebar.toggle', // TODO - extract to a component!
      handler: () => {},
      displayName: 'Toggle component list',
      keybinding: 's',
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
              context={this.getContext()}
              onSidebarTogglerChange={this.setSidebarToggle}
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
      keyChar: 's',
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
    Slot.withType<SidebarItemSlot>(),
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
    [routeSlot, menuSlot, sidebarSlot, scopeBadgeSlot, menuWidgetSlot, menuItemSlot, sidebarItemSlot]: [
      RouteSlot,
      RouteSlot,
      SidebarSlot,
      ScopeBadgeSlot,
      MenuWidgetSlot,
      MenuItemSlot,
      SidebarItemSlot
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
      menuItemSlot
    );
    scopeUi.registerExplicitRoutes();
    scopeUi.registerMenuItem(scopeUi.menuItems);
    ui.registerRoot(scopeUi.uiRoot.bind(scopeUi));
    scopeUi.registerSidebarLink(() => (
      <MenuLinkItem exact href="/" icon="comps">
        Overview
      </MenuLinkItem>
    ));

    return scopeUi;
  }
}

export default ScopeUI;

ScopeAspect.addRuntime(ScopeUI);
