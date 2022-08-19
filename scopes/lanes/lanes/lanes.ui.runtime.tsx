import React, { ReactNode } from 'react';
import { Route, RouteProps } from 'react-router-dom';
import { Slot, Harmony } from '@teambit/harmony';
import { UIRuntime, UiUI, UIAspect } from '@teambit/ui';
import { LanesAspect } from '@teambit/lanes';
import { NavigationSlot, RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { NotFoundPage } from '@teambit/design.ui.pages.not-found';
import ScopeAspect, { ScopeUI } from '@teambit/scope';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import ComponentAspect, { ComponentUI } from '@teambit/component';
import SidebarAspect, { SidebarUI } from '@teambit/sidebar';
import { MenuWidget, MenuWidgetSlot } from '@teambit/ui-foundation.ui.menu';
import { LaneGallery, LaneOverviewLine, LaneOverviewLineSlot } from '@teambit/lanes.ui.gallery';
import { LanesNavPlugin, LanesOrderedNavigationSlot, LanesOverviewMenu, UseLaneMenu } from '@teambit/lanes.ui.menus';
import { LanesHost, LanesModel } from '@teambit/lanes.ui.models';
import { LaneReadmeOverview } from '@teambit/lanes.ui.readme';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { ViewedLaneFromUrl } from '@teambit/lanes.ui.viewed-lane';
import { LanesListDropdown } from '@teambit/lanes.ui.dropdown';

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
              <Route
                index
                element={
                  <LaneReadmeOverview host={this.host} overviewSlot={this.overviewSlot} routeSlot={this.routeSlot} />
                }
              />
              <Route path="~gallery" element={this.getLaneGallery()} />
              <Route path="~component/*" element={this.componentUi.getComponentUI(this.host)} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </>
        ),
      },
    ];
  }

  getLaneGallery() {
    return <LaneGallery routeSlot={this.routeSlot} overviewSlot={this.overviewSlot} host={this.lanesHost} />;
  }

  getMenuRoutes() {
    return [
      {
        path: LanesModel.lanesPrefix,
        children: (
          <Route path={`${LanesModel.lanePath}/*`}>
            <Route path="*" element={this.getLanesOverviewMenu()} />
            <Route path="~component/*" element={this.componentUi.getMenu(this.host)} />
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
      {
        props: {
          href: '.',
          exact: true,
          children: 'README',
        },
        order: 1,
        hide: () => {
          const { lanesModel } = useLanes();
          return !lanesModel?.viewedLane?.readmeComponent;
        },
      },
      {
        props: {
          href: '~gallery',
          children: 'Gallery',
          exact: true,
        },
        order: 1,
      },
    ]);
  }

  private registerRoutes() {
    this.registerHostAspectRoutes();
    this.registerLanesRoutes();
  }

  private registerLanesDropdown() {
    this.hostAspect?.registerSidebarLink(() => <LanesListDropdown />);
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
    // const drawer = new LanesDrawer({ showScope: lanesUi.lanesHost === 'workspace' });
    // sidebarUi.registerDrawer(drawer);
    lanesUi.registerRoutes();
    lanesUi.registerMenuWidget(() => {
      const { lanesModel } = useLanes();
      if (!lanesModel?.viewedLane) return null;
      const { viewedLane, currentLane } = lanesModel;
      return <UseLaneMenu host={lanesUi.lanesHost} viewedLane={viewedLane} currentLane={currentLane} />;
    });
    lanesUi.registerLanesDropdown();
    return lanesUi;
  }
}

export default LanesUI;

LanesAspect.addRuntime(LanesUI);
