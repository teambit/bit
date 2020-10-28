import type { ComponentUI, ComponentModel } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { Slot, SlotRegistry } from '@teambit/harmony';
import ReactRouterAspect, { RouteSlot, ReactRouterUI } from '@teambit/react-router';
import { SidebarAspect, SidebarUI } from '@teambit/sidebar';
import { ComponentTreeNode } from '@teambit/component-tree';
import { UIAspect, UIRootUI as UIRoot, UIRuntime, UiUI } from '@teambit/ui';
import React, { ComponentType, ReactNode } from 'react';
import { RouteProps } from 'react-router-dom';
import CommandBarAspect, { CommandBarUI, ComponentSearcher, CommandHandler } from '@teambit/command-bar';
import { ScopeAspect } from './scope.aspect';
import { Scope } from './ui/scope';
import { ScopeModel } from './ui/scope-model';
import { ComponentsDrawer } from './components.drawer';
import { ScopeBadge } from './scope-badge';
import { ScopeMenu } from './ui/menu';

export type MenuItem = {
  label: JSX.Element | string | null;
};

export type ScopeBadgeSlot = SlotRegistry<ScopeBadge>;

export type ScopeContextType = ComponentType<{ scope: ScopeModel; children: ReactNode }>;

export type SidebarSlot = SlotRegistry<ComponentTreeNode>;

export type ScopeOverview = ComponentType;

export type ScopeOverviewSlot = SlotRegistry<ScopeOverview>;

export type MenuWidget = ComponentType;

export type MenuWidgetSlot = SlotRegistry<MenuWidget[]>;

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

    private menuWidgetSlot: MenuWidgetSlot
  ) {}

  private setKeyBindHandler: (updated: CommandHandler) => void = () => {};

  /**
   * register a new badge into the scope overview.
   */
  registerBadge(badge: ScopeBadge) {
    this.scopeBadgeSlot.register(badge);
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
      { exact: true, path: '/', children: <ScopeMenu widgetSlot={this.menuWidgetSlot} /> }, // what happens when we have multiple scopes like in symphony?
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

  uiRoot(): UIRoot {
    this.sidebar.registerDrawer(new ComponentsDrawer(this.sidebarSlot));
    this.commandBarUI.addSearcher(this.componentSearcher);

    const [setKeyBindHandler] = this.commandBarUI.addCommand({
      id: 'sidebar', // extract to constant!
      handler: () => {},
      displayName: 'open/close sidebar',
      keybinding: 's',
    });
    this.setKeyBindHandler = setKeyBindHandler;

    return {
      routes: [
        {
          path: '/',
          children: (
            <Scope
              routeSlot={this.routeSlot}
              menuSlot={this.menuSlot}
              sidebar={<this.sidebar.render />}
              scopeUi={this}
              badgeSlot={this.scopeBadgeSlot}
              context={this.getContext()}
              onSidebarTogglerChange={this.setKeyBindHandler}
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

  static dependencies = [UIAspect, ComponentAspect, SidebarAspect, CommandBarAspect, ReactRouterAspect];
  static runtime = UIRuntime;
  static slots = [
    Slot.withType<RouteProps>(),
    Slot.withType<RouteProps>(),
    Slot.withType<ComponentTreeNode>(),
    Slot.withType<ScopeBadge>(),
    Slot.withType<ScopeOverview>(),
    Slot.withType<MenuWidget[]>(),
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
    [routeSlot, menuSlot, sidebarSlot, scopeBadgeSlot, menuWidgetSlot]: [
      RouteSlot,
      RouteSlot,
      SidebarSlot,
      ScopeBadgeSlot,
      MenuWidgetSlot
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
      menuWidgetSlot
    );
    scopeUi.registerExplicitRoutes();
    ui.registerRoot(scopeUi.uiRoot.bind(scopeUi));

    return scopeUi;
  }
}

export default ScopeUI;

ScopeAspect.addRuntime(ScopeUI);
