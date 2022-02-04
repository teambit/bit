import React, { ReactNode } from 'react';
import { RouteProps } from 'react-router-dom';
import { Slot, Harmony } from '@teambit/harmony';
import { MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import { UIRuntime, UiUI, UIAspect } from '@teambit/ui';
import { LanesAspect } from '@teambit/lanes';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import {
  LanesDrawer,
  LanesHost,
  LanesOverview,
  LanesProvider,
  laneRouteUrlRegex,
  LaneComponent,
  laneComponentUrlRegex,
} from '@teambit/lanes.lanes.ui';
import { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import ScopeAspect, { ScopeUI } from '@teambit/scope';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import ReactRouterAspect, { ReactRouterUI } from '@teambit/react-router';

export class LanesUI {
  static dependencies = [UIAspect, ReactRouterAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<RouteProps>(), Slot.withType<MenuItemSlot>(), Slot.withType<RouteProps>()];

  constructor(
    private uiUi: UiUI,
    private routeSlot: RouteSlot,
    private menuRouteSlot: RouteSlot,
    private menuItemSlot: MenuItemSlot,
    private reactRouter: ReactRouterUI,
    private workspace?: WorkspaceUI,
    private scope?: ScopeUI
  ) {
    this.lanesHost = workspace ? 'workspace' : 'scope';
  }

  readonly lanesHost: LanesHost;

  registerRoute(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  registerExplicitRoutes() {
    if (this.workspace) {
      this.workspace.registerRoutes([
        {
          path: laneComponentUrlRegex,
          children: <LaneComponent routeSlot={this.routeSlot} />,
        },
        {
          path: laneRouteUrlRegex,
          children: <LanesOverview routeSlot={this.routeSlot} />,
        },
      ]);
    }
    if (this.scope) {
      this.scope.registerRoutes([
        {
          path: laneComponentUrlRegex,
          children: <LaneComponent routeSlot={this.routeSlot} />,
        },
        {
          path: laneRouteUrlRegex,
          children: <LanesOverview routeSlot={this.routeSlot} />,
        },
      ]);
    }
  }

  registerDrawers(...drawers: DrawerType[]) {
    if (this.workspace) {
      this.workspace.registerDrawers(...drawers);
    }
    if (this.scope) {
      this.scope.registerDrawers(...drawers);
    }
    return this;
  }

  private renderContext = ({ children }: { children: ReactNode }) => {
    return LanesProvider({ host: this.lanesHost, reactRouter: this.reactRouter, children });
  };

  static async provider(
    [uiUi, reactRouter]: [UiUI, ReactRouterUI],
    _,
    [routeSlot, menuItemSlot, menuRouteSlot]: [RouteSlot, MenuItemSlot, RouteSlot],
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
    const lanesUi = new LanesUI(uiUi, routeSlot, menuRouteSlot, menuItemSlot, reactRouter, workspace, scope);
    uiUi.registerRenderHooks({ reactContext: lanesUi.renderContext });
    const drawer = new LanesDrawer(lanesUi.lanesHost);
    lanesUi.registerDrawers(drawer);
    lanesUi.registerExplicitRoutes();

    return lanesUi;
  }
}

export default LanesUI;

LanesAspect.addRuntime(LanesUI);
