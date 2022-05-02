import React, { ReactNode } from 'react';
import { RouteProps } from 'react-router-dom';
import { Slot, Harmony } from '@teambit/harmony';
import { UIRuntime, UiUI, UIAspect } from '@teambit/ui';
import { LanesAspect } from '@teambit/lanes';
import { NavigationSlot, RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import {
  LanesDrawer,
  LanesHost,
  LaneGallery,
  LanesOrderedNavigationSlot,
  LanesModel,
  LanesOverviewMenu,
  ViewedLaneFromUrl,
  LaneOverviewLineSlot,
  LaneOverviewLine,
  UseLaneMenu,
  useLanesContext,
  LanesNavPlugin,
  LaneReadmeOverview,
} from '@teambit/lanes.ui.lanes';
import ScopeAspect, { ScopeUI } from '@teambit/scope';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import ComponentAspect, { ComponentUI } from '@teambit/component';
import SidebarAspect, { SidebarUI } from '@teambit/sidebar';
import { MenuWidget, MenuWidgetSlot } from '@teambit/ui-foundation.ui.menu';

export class LanesUI {
  static dependencies = [UIAspect, ComponentAspect, WorkspaceAspect, ScopeAspect, SidebarAspect];
  static runtime = UIRuntime;
  static slots = [
    Slot.withType<RouteProps>(),
    Slot.withType<LaneOverviewLineSlot>(),
    Slot.withType<NavigationSlot>(),
    Slot.withType<MenuWidgetSlot>(),
  ];

  constructor(
    private componentUi: ComponentUI,
    private routeSlot: RouteSlot,
    private navSlot: LanesOrderedNavigationSlot,
    private menuWidgetSlot: MenuWidgetSlot,
    /**
     * overview line slot to add new lines beneath the overview section
     */
    private overviewSlot: LaneOverviewLineSlot,
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
        path: `${LanesModel.laneRouteUrlRegex}/~readme`,
        children: <LaneReadmeOverview host={this.host} overviewSlot={this.overviewSlot} routeSlot={this.routeSlot} />,
      },
      {
        path: `${LanesModel.laneRouteUrlRegex}/~gallery`,
        children: <LaneGallery routeSlot={this.routeSlot} overviewSlot={this.overviewSlot} />,
      },
      {
        exact: true,
        path: `${LanesModel.laneRouteUrlRegex}`,
        children: <LaneReadmeOverview host={this.host} overviewSlot={this.overviewSlot} routeSlot={this.routeSlot} />,
      },
    ]);
    this.hostAspect.registerMenuRoutes([
      {
        path: LanesModel.laneComponentUrlRegex,
        children: this.componentUi.getMenu(this.host),
      },
      {
        path: LanesModel.laneRouteUrlRegex,
        children: <LanesOverviewMenu navigationSlot={this.navSlot} widgetSlot={this.menuWidgetSlot} />,
      },
    ]);
  }

  registerMenuWidget(...menuItems: MenuWidget[]) {
    this.menuWidgetSlot.register(menuItems);
  }

  private registerLanesRoutes() {
    this.registerNavigation([
      {
        props: {
          href: '',
          children: 'README',
        },
        order: 1,
        hide: () => {
          const lanesContext = useLanesContext();
          return !lanesContext?.viewedLane?.readmeComponent;
        },
      },
      {
        props: {
          href: '~gallery',
          children: 'Gallery',
        },
        order: 1,
      },
    ]);
  }

  private registerRoutes() {
    this.registerHostAspectRoutes();
    this.registerLanesRoutes();
  }

  private renderContext = ({ children }: { children: ReactNode }) => {
    return <ViewedLaneFromUrl>{children}</ViewedLaneFromUrl>;
  };

  registerRoute(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  /**
   * register a new line beneath the lane overview section.
   */
  registerOverviewLine(...lines: LaneOverviewLine[]) {
    this.overviewSlot.register(lines);
    return this;
  }

  registerNavigation(routes: LanesNavPlugin[]) {
    this.navSlot.register(routes);
  }

  static async provider(
    [uiUi, componentUi, workspaceUi, scopeUi, sidebarUi]: [UiUI, ComponentUI, WorkspaceUI, ScopeUI, SidebarUI],
    _,
    [routeSlot, overviewSlot, navSlot, menuWidgetSlot]: [
      RouteSlot,
      LaneOverviewLineSlot,
      LanesOrderedNavigationSlot,
      MenuWidgetSlot
    ],
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
    const lanesUi = new LanesUI(componentUi, routeSlot, navSlot, overviewSlot, menuWidgetSlot, workspace, scope);
    uiUi.registerRenderHooks({ reactContext: lanesUi.renderContext });
    const drawer = new LanesDrawer({ showScope: lanesUi.lanesHost === 'workspace' });
    sidebarUi.registerDrawer(drawer);
    lanesUi.registerRoutes();
    lanesUi.registerMenuWidget(() => <UseLaneMenu host={lanesUi.lanesHost} />);
    return lanesUi;
  }
}

export default LanesUI;

LanesAspect.addRuntime(LanesUI);
