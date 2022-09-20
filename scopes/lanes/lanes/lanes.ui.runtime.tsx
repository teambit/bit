import React, { ReactNode } from 'react';
import { Route, RouteProps } from 'react-router-dom';
import { Slot, Harmony } from '@teambit/harmony';
import { UIRuntime, UiUI, UIAspect } from '@teambit/ui';
import { LanesAspect } from '@teambit/lanes';
import { NavigationSlot, RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { NotFoundPage } from '@teambit/design.ui.pages.not-found';
import ScopeAspect, { ScopeUI } from '@teambit/scope';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import ComponentAspect, { ComponentID, ComponentUI, useIdFromLocation } from '@teambit/component';
import SidebarAspect, { SidebarUI } from '@teambit/sidebar';
import { MenuWidget, MenuWidgetSlot } from '@teambit/ui-foundation.ui.menu';
import { LaneOverview, LaneOverviewLine, LaneOverviewLineSlot } from '@teambit/lanes.ui.lane-overview';
import {
  LanesNavPlugin,
  LanesOrderedNavigationSlot,
  LanesOverviewMenu,
} from '@teambit/lanes.ui.menus.lanes-overview-menu';
import { UseLaneMenu } from '@teambit/lanes.ui.menus.use-lanes-menu';
import { LanesHost, LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { LanesProvider, useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneSwitcher } from '@teambit/lanes.ui.navigation.lane-switcher';
import { LaneId } from '@teambit/lane-id';
import { useViewedLaneFromUrl } from '@teambit/lanes.hooks.use-viewed-lane-from-url';

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
    this.hostAspect.registerRoutes(this.getLaneRoutes());
    this.hostAspect.registerMenuRoutes(this.getMenuRoutes());
  }

  getLaneRoutes() {
    return [
      {
        path: LanesModel.lanesPrefix,
        children: (
          <>
            <Route path={LanesModel.lanePath}>
              <Route index element={this.getLaneOverview()} />
              <Route path="~component/*" element={this.getLaneComponent()} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </>
        ),
      },
    ];
  }

  overrideComputeLaneUrl(
    fn: () => {
      prefix: string;
      path: string;
      getLaneIdFromPathname: (pathname: string) => LaneId | undefined;
      getLaneUrl: (laneId: LaneId, relative?: boolean) => string;
      getLaneComponentUrl: (componentId: ComponentID, laneId: LaneId) => string;
    }
  ) {
    const { prefix, path, getLaneComponentUrl, getLaneIdFromPathname, getLaneUrl } = fn();
    LanesModel.lanesPrefix = prefix;
    LanesModel.lanePath = path;
    LanesModel.getLaneComponentUrl = getLaneComponentUrl;
    LanesModel.getLaneUrl = getLaneUrl;
    LanesModel.getLaneIdFromPathname = getLaneIdFromPathname;
  }

  // getLaneReadme() {
  //   return <LaneReadmeOverview host={this.host} overviewSlot={this.overviewSlot} routeSlot={this.routeSlot} />;
  // }

  useComponentId = () => {
    const idFromLocation = useIdFromLocation();
    const { lanesModel } = useLanes();
    const laneFromUrl = useViewedLaneFromUrl(true);
    const laneComponentId =
      idFromLocation && !laneFromUrl?.isDefault()
        ? lanesModel?.resolveComponent(idFromLocation, laneFromUrl)
        : undefined;
    return laneComponentId?.toString();
  };

  useComponentFilters = (_componentId?: ComponentID) => {
    return {
      log: _componentId && {
        logHead: _componentId.version,
      },
    };
  };

  getLaneComponent() {
    return this.componentUi.getComponentUI(this.host, {
      componentId: this.useComponentId,
      useComponentFilters: this.useComponentFilters,
    });
  }

  getLaneComponentMenu() {
    return this.componentUi.getMenu(this.host, {
      componentId: this.useComponentId,
      useComponentFilters: this.useComponentFilters,
    });
  }

  getLaneOverview() {
    return <LaneOverview routeSlot={this.routeSlot} overviewSlot={this.overviewSlot} host={this.lanesHost} />;
  }

  getMenuRoutes() {
    return [
      {
        path: LanesModel.lanesPrefix,
        children: (
          <Route path={`${LanesModel.lanePath}/*`}>
            <Route path="*" element={this.getLanesOverviewMenu()} />
            <Route path="~component/*" element={this.getLaneComponentMenu()} />
          </Route>
        ),
      },
    ];
  }

  getLanesOverviewMenu() {
    return <LanesOverviewMenu navigationSlot={this.navSlot} widgetSlot={this.menuWidgetSlot} />;
  }

  registerMenuWidget(...menuItems: MenuWidget[]) {
    this.menuWidgetSlot.register(menuItems);
  }

  private registerLanesRoutes() {
    this.registerNavigation([
      // {
      //   props: {
      //     href: '.',
      //     exact: true,
      //     children: 'README',
      //   },
      //   order: 1,
      //   hide: () => {
      //     const { lanesModel } = useLanes();
      //     return !lanesModel?.viewedLane?.readmeComponent;
      //   },
      // },
      {
        props: {
          href: '.',
          exact: true,
          children: 'Overview',
        },
        order: 1,
      },
    ]);
  }

  private registerRoutes() {
    this.registerHostAspectRoutes();
    this.registerLanesRoutes();
  }

  getLanesSwitcher() {
    const LanesSwitcher = <LaneSwitcher groupByScope={this.lanesHost === 'workspace'} />;
    return LanesSwitcher;
  }

  getLanesProvider() {
    return LanesProvider;
  }

  getUseLanes() {
    return useLanes;
  }

  private registerLanesDropdown() {
    const LanesSwitcher = this.getLanesSwitcher();

    this.hostAspect?.registerSidebarLink({
      component: function Gallery() {
        return LanesSwitcher;
      },
      weight: 1000,
    });
  }

  private renderContext = ({ children }: { children: ReactNode }) => {
    return <LanesProvider>{children}</LanesProvider>;
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
    [uiUi, componentUi, workspaceUi, scopeUi]: [UiUI, ComponentUI, WorkspaceUI, ScopeUI, SidebarUI],
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
    if (uiUi) uiUi.registerRenderHooks({ reactContext: lanesUi.renderContext });
    lanesUi.registerRoutes();
    lanesUi.registerMenuWidget(() => {
      const { lanesModel } = useLanes();
      if (!lanesModel?.viewedLane) return null;
      const { viewedLane, currentLane } = lanesModel;
      return <UseLaneMenu host={lanesUi.lanesHost} viewedLaneId={viewedLane.id} currentLaneId={currentLane?.id} />;
    });
    lanesUi.registerLanesDropdown();
    return lanesUi;
  }
}

export default LanesUI;

LanesAspect.addRuntime(LanesUI);
