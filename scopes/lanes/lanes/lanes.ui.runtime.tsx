import React, { ReactNode } from 'react';
import { RouteProps } from 'react-router-dom';
import { Slot, Harmony } from '@teambit/harmony';
import { UIRuntime, UiUI, UIAspect } from '@teambit/ui';
import { LanesAspect } from '@teambit/lanes';
import { NavigationSlot, RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import {
  LanesDrawer,
  LanesHost,
  LaneOverview,
  LanesOrderedNavigationSlot,
  LanesModel,
  LanesOverviewMenu,
  CurrentLaneFromUrl,
  LaneOverviewLineSlot,
  LaneOverviewLine,
  LaneReadme,
  NavPlugin,
  useLanesContext,
} from '@teambit/lanes.ui.lanes';
import ScopeAspect, { ScopeUI } from '@teambit/scope';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import ComponentAspect, { ComponentUI } from '@teambit/component';
import SidebarAspect, { SidebarUI } from '@teambit/sidebar';

export class LanesUI {
  static dependencies = [UIAspect, ComponentAspect, WorkspaceAspect, ScopeAspect, SidebarAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<RouteProps>(), Slot.withType<LaneOverviewLineSlot>(), Slot.withType<NavigationSlot>()];

  constructor(
    private componentUi: ComponentUI,
    private routeSlot: RouteSlot,
    private navSlot: LanesOrderedNavigationSlot,
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
      { path: `${LanesModel.laneRouteUrlRegex}/~readme`, children: <LaneReadme host={this.host} /> },
      {
        path: `${LanesModel.laneRouteUrlRegex}/~gallery`,
        children: <LaneOverview routeSlot={this.routeSlot} overviewSlot={this.overviewSlot} />,
      },
      { exact: true, path: `${LanesModel.laneRouteUrlRegex}`, children: <LaneReadme host={this.host} /> },
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
    this.registerNavigation([
      {
        props: {
          href: '',
          children: 'README',
        },
        order: 1,
        hide: () => {
          const lanesContext = useLanesContext();
          return !lanesContext?.currentLane?.readmeComponent;
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
    return <CurrentLaneFromUrl>{children}</CurrentLaneFromUrl>;
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

  registerNavigation(routes: NavPlugin[]) {
    this.navSlot.register(routes);
  }

  static async provider(
    [uiUi, componentUi, workspaceUi, scopeUi, sidebarUi]: [UiUI, ComponentUI, WorkspaceUI, ScopeUI, SidebarUI],
    _,
    [routeSlot, overviewSlot, navSlot]: [RouteSlot, LaneOverviewLineSlot, LanesOrderedNavigationSlot],
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
    const lanesUi = new LanesUI(componentUi, routeSlot, navSlot, overviewSlot, workspace, scope);
    uiUi.registerRenderHooks({ reactContext: lanesUi.renderContext });
    const drawer = new LanesDrawer({ showScope: lanesUi.lanesHost === 'workspace' });
    sidebarUi.registerDrawer(drawer);
    lanesUi.registerRoutes();

    return lanesUi;
  }
}

export default LanesUI;

LanesAspect.addRuntime(LanesUI);
