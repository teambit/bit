import React, { ReactNode } from 'react';
import { RouteProps } from 'react-router-dom';
import { Slot, Harmony } from '@teambit/harmony';
import { MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import { UIRuntime, UiUI, UIAspect } from '@teambit/ui';
import { LanesAspect } from '@teambit/lanes';
import { NavigationSlot, RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import {
  LanesDrawer,
  LanesHost,
  LanesOverview,
  LanesProvider,
  laneRouteUrlRegex,
  laneComponentUrlRegex,
  LanesOverviewMenu,
  OrderedNavigationSlot,
} from '@teambit/lanes.lanes.ui';
import { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import ScopeAspect, { ScopeUI } from '@teambit/scope';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import ReactRouterAspect, { NavLinkProps, ReactRouterUI } from '@teambit/react-router';
import ComponentAspect, { ComponentUI } from '@teambit/component';

export class LanesUI {
  static dependencies = [UIAspect, ReactRouterAspect, ComponentAspect];
  static runtime = UIRuntime;
  static slots = [
    Slot.withType<RouteProps>(),
    Slot.withType<MenuItemSlot>(),
    Slot.withType<RouteProps>(),
    Slot.withType<NavigationSlot>(),
  ];

  constructor(
    private uiUi: UiUI,
    private componentUi: ComponentUI,
    private routeSlot: RouteSlot,
    private menuRouteSlot: RouteSlot,
    private navSlot: OrderedNavigationSlot,
    private menuItemSlot: MenuItemSlot,
    private reactRouter: ReactRouterUI,
    private workspace?: WorkspaceUI,
    private scope?: ScopeUI
  ) {
    this.hostAspect = workspace || scope;
    this.lanesHost = workspace ? 'workspace' : 'scope';
    this.host = workspace ? WorkspaceAspect.id : ScopeAspect.id;
  }

  private readonly lanesHost: LanesHost;
  private readonly hostAspect?: WorkspaceUI | ScopeUI;
  private readonly host: string;

  private registerExplicitHostRoutes() {
    if (this.hostAspect) {
      this.hostAspect.registerRoutes([
        {
          path: laneComponentUrlRegex,
          children: this.componentUi.getComponentUI(this.host),
        },
        {
          path: laneRouteUrlRegex,
          children: <LanesOverview routeSlot={this.routeSlot} />,
        },
      ]);
      this.hostAspect.registerMenuRoutes([
        {
          path: laneComponentUrlRegex,
          children: this.componentUi.getMenu(this.host),
        },
        {
          path: laneRouteUrlRegex,
          children: <LanesOverviewMenu navigationSlot={this.navSlot} host={this.host} />,
        },
      ]);
    }
  }

  private registerExplicitLanesRoutes() {
    this.registerNavigation({
      href: '~gallery',
      children: 'Gallery',
    });
    this.registerNavigation({
      href: '',
      children: 'Gallery',
    });
  }

  private registerExplicitRoutes() {
    this.registerExplicitHostRoutes();
    this.registerExplicitLanesRoutes();
  }

  private renderContext = ({ children }: { children: ReactNode }) => {
    return LanesProvider({ host: this.lanesHost, reactRouter: this.reactRouter, children });
  };

  registerRoute(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  registerNavigation(nav: NavLinkProps, order?: number) {
    this.navSlot.register({
      props: nav,
      order,
    });
  }

  registerDrawers(...drawers: DrawerType[]) {
    if (this.hostAspect) {
      this.hostAspect.registerDrawers(...drawers);
    }
    return this;
  }

  static async provider(
    [uiUi, reactRouter, componentUi]: [UiUI, ReactRouterUI, ComponentUI],
    _,
    [routeSlot, menuItemSlot, menuRouteSlot, navSlot]: [RouteSlot, MenuItemSlot, RouteSlot, OrderedNavigationSlot],
    harmony: Harmony
  ) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    let workspace: WorkspaceUI | undefined;
    let scope: ScopeUI | undefined;
    if (host === WorkspaceAspect.id) {
      workspace = harmony.get<WorkspaceUI>(WorkspaceAspect.id);
    }
    if (host === ScopeAspect.id) {
      scope = harmony.get<ScopeUI>(ScopeAspect.id);
    }
    const lanesUi = new LanesUI(
      uiUi,
      componentUi,
      routeSlot,
      menuRouteSlot,
      navSlot,
      menuItemSlot,
      reactRouter,
      workspace,
      scope
    );
    uiUi.registerRenderHooks({ reactContext: lanesUi.renderContext });
    const drawer = new LanesDrawer(lanesUi.lanesHost);
    lanesUi.registerDrawers(drawer);
    lanesUi.registerExplicitRoutes();

    return lanesUi;
  }
}

export default LanesUI;

LanesAspect.addRuntime(LanesUI);
