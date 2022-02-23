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
  LanesOrderedNavigationSlot,
  LanesModel,
  LanesOverviewMenu,
  CurrentLaneFromUrl,
} from '@teambit/lanes.ui.lanes';
import ScopeAspect, { ScopeUI } from '@teambit/scope';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import ReactRouterAspect, { NavLinkProps, ReactRouterUI } from '@teambit/react-router';
import ComponentAspect, { ComponentUI } from '@teambit/component';
import SidebarAspect, { SidebarUI } from '@teambit/sidebar';

export class LanesUI {
  static dependencies = [UIAspect, ReactRouterAspect, ComponentAspect, WorkspaceAspect, ScopeAspect, SidebarAspect];
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
    private navSlot: LanesOrderedNavigationSlot,
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

  private registerHostAspectRoutes() {
    if (!this.hostAspect) return;
    this.hostAspect.registerRoutes([
      {
        path: LanesModel.laneComponentUrlRegex,
        children: this.componentUi.getComponentUI(this.host),
      },
      {
        path: LanesModel.laneRouteUrlRegex,
        children: <LanesOverview routeSlot={this.routeSlot} />,
      },
    ]);
    this.hostAspect.registerMenuRoutes([
      {
        path: LanesModel.laneComponentUrlRegex,
        children: this.componentUi.getMenu(this.host),
      },
      {
        path: LanesModel.laneRouteUrlRegex,
        children: <LanesOverviewMenu navigationSlot={this.navSlot} host={this.host} />,
      },
    ]);
  }

  private registerLanesRoutes() {
    this.registerNavigation({
      href: '',
      children: 'Gallery',
    });
  }

  private registerRoutes() {
    this.registerHostAspectRoutes();
    this.registerLanesRoutes();
  }

  private renderContext = ({ children }: { children: ReactNode }) => {
    return <CurrentLaneFromUrl>{children}</CurrentLaneFromUrl>;
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

  static async provider(
    [uiUi, reactRouter, componentUi, workspaceUi, scopeUi, sidebarUi]: [
      UiUI,
      ReactRouterUI,
      ComponentUI,
      WorkspaceUI,
      ScopeUI,
      SidebarUI
    ],
    _,
    [routeSlot, menuItemSlot, menuRouteSlot, navSlot]: [RouteSlot, MenuItemSlot, RouteSlot, LanesOrderedNavigationSlot],
    harmony: Harmony
  ) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    let workspace: WorkspaceUI | undefined;
    let scope: ScopeUI | undefined;
    if (host === WorkspaceAspect.id) {
      workspace = workspaceUi;
    }
    if (host === ScopeAspect.id) {
      scope = scopeUi;
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
    const drawer = new LanesDrawer({ showScope: lanesUi.lanesHost === 'workspace' });
    sidebarUi.registerDrawer(drawer);
    lanesUi.registerRoutes();

    return lanesUi;
  }
}

export default LanesUI;

LanesAspect.addRuntime(LanesUI);
