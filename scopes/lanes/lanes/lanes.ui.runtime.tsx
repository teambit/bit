import React, { ReactNode, useContext } from 'react';
import { Route, RouteProps } from 'react-router-dom';
import { Slot, Harmony, SlotRegistry } from '@teambit/harmony';
import { LaneCompare, type LaneCompareProps as DefaultLaneCompareProps } from '@teambit/lanes.ui.compare.lane-compare';
import { UIRuntime, UiUI, UIAspect } from '@teambit/ui';
import type { NavigationSlot, RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { NotFoundPage } from '@teambit/design.ui.pages.not-found';
import { ScopeAspect, ScopeContext, ScopeUI } from '@teambit/scope';
import { WorkspaceAspect, WorkspaceUI } from '@teambit/workspace';
import { ComponentAspect, ComponentUI, useIdFromLocation, ComponentID } from '@teambit/component';
import { MenuWidget, MenuWidgetSlot } from '@teambit/ui-foundation.ui.menu';
import { LaneOverview, LaneOverviewLine, LaneOverviewLineSlot } from '@teambit/lanes.ui.lane-overview';
import {
  LanesNavPlugin,
  LanesOrderedNavigationSlot,
  LanesOverviewMenu,
} from '@teambit/lanes.ui.menus.lanes-overview-menu';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { UseLaneMenu } from '@teambit/lanes.ui.menus.use-lanes-menu';
import { LanesHost, LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { LanesProvider, useLanes, IgnoreDerivingFromUrl } from '@teambit/lanes.hooks.use-lanes';
import { LaneSwitcher } from '@teambit/lanes.ui.navigation.lane-switcher';
import { LaneId } from '@teambit/lane-id';
import { useViewedLaneFromUrl } from '@teambit/lanes.hooks.use-viewed-lane-from-url';
import { ComponentCompareAspect, ComponentCompareUI } from '@teambit/component-compare';
import { LaneComparePage } from '@teambit/lanes.ui.compare.lane-compare-page';
import { ScopeIcon } from '@teambit/scope.ui.scope-icon';
import { CommandBarUI, CommandBarAspect } from '@teambit/command-bar';

import { LanesAspect } from './lanes.aspect';
import styles from './lanes.ui.module.scss';

export type LaneCompareProps = Partial<DefaultLaneCompareProps>;
export type LaneProviderIgnoreSlot = SlotRegistry<IgnoreDerivingFromUrl>;
export function useComponentFilters() {
  const idFromLocation = useIdFromLocation(undefined, true);
  const { lanesModel, loading } = useLanes();
  const laneFromUrl = useViewedLaneFromUrl();
  const laneComponentId =
    idFromLocation && !laneFromUrl?.isDefault()
      ? (lanesModel?.resolveComponentFromUrl(idFromLocation, laneFromUrl) ?? null)
      : null;

  if (laneComponentId === null || loading) {
    return {
      loading: true,
    };
  }

  return {
    loading: false,
    log: {
      head: laneComponentId.version,
    },
  };
}

export function useLaneComponentIdFromUrl(): ComponentID | undefined | null {
  const idFromLocation = useIdFromLocation(undefined, true);
  const { lanesModel, loading } = useLanes();
  const laneFromUrl = useViewedLaneFromUrl();
  const query = useQuery();
  const componentVersion = query.get('version');

  if (!idFromLocation) return null;

  const compIdFromLocation = ComponentID.tryFromString(
    `${idFromLocation}${componentVersion ? `@${componentVersion}` : ''}`
  );

  if (compIdFromLocation) return compIdFromLocation;
  if (loading) return undefined;

  const lanesComp = (lanesModel?.resolveComponentFromUrl(idFromLocation, laneFromUrl) as any | undefined) ?? null;

  if (componentVersion) {
    return lanesComp?.changeVersion(componentVersion);
  }

  return lanesComp;
}

export function useComponentId() {
  return useLaneComponentIdFromUrl()?.toString();
}

export class LanesUI {
  static dependencies = [
    UIAspect,
    ComponentAspect,
    WorkspaceAspect,
    ScopeAspect,
    ComponentCompareAspect,
    CommandBarAspect,
  ];

  static runtime = UIRuntime;
  static slots = [
    Slot.withType<RouteProps>(),
    Slot.withType<LaneOverviewLineSlot>(),
    Slot.withType<NavigationSlot>(),
    Slot.withType<MenuWidgetSlot>(),
    Slot.withType<LaneProviderIgnoreSlot>(),
  ];

  constructor(
    private componentUI: ComponentUI,
    private componentCompareUI: ComponentCompareUI,
    private routeSlot: RouteSlot,
    private navSlot: LanesOrderedNavigationSlot,
    private menuWidgetSlot: MenuWidgetSlot,
    /**
     * overview line slot to add new lines beneath the overview section
     */
    private overviewSlot: LaneOverviewLineSlot,
    private laneProviderIgnoreSlot: LaneProviderIgnoreSlot,
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
              <Route path="~compare/*" element={this.getLanesComparePage()} />
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
    LanesModel.getLaneComponentUrl = getLaneComponentUrl as any;
    LanesModel.getLaneUrl = getLaneUrl;
    LanesModel.getLaneIdFromPathname = getLaneIdFromPathname;
  }

  // getLaneReadme() {
  //   return <LaneReadmeOverview host={this.host} overviewSlot={this.overviewSlot} routeSlot={this.routeSlot} />;
  // }

  getLaneComponent() {
    return this.componentUI.getComponentUI(this.host, {
      componentId: useComponentId,
      useComponentFilters,
    });
  }

  getLaneComponentMenu() {
    return this.componentUI.getMenu(this.host, {
      componentId: useComponentId,
      useComponentFilters,
    });
  }

  getLaneOverview() {
    return (
      <LaneOverview
        routeSlot={this.routeSlot}
        overviewSlot={this.overviewSlot}
        host={this.lanesHost}
        useLanes={useLanes}
      />
    );
  }

  getLanesComparePage() {
    return <LaneComparePage getLaneCompare={this.getLaneCompare} groupByScope={this.lanesHost === 'workspace'} />;
  }

  getMenuRoutes() {
    return [
      {
        path: LanesModel.lanesPrefix,
        children: (
          <Route path={`${LanesModel.lanePath}/*`}>
            <Route path={'*'} element={this.getLanesOverviewMenu()} />
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
    return this;
  }

  registerLaneProviderIgnoreSlot(ignoreFn: IgnoreDerivingFromUrl) {
    this.laneProviderIgnoreSlot.register(ignoreFn);
    return this;
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
      {
        props: {
          href: '~compare',
          children: 'Compare',
        },
        order: 2,
        hide: () => {
          const { lanesModel } = useLanes();
          return !lanesModel?.viewedLane || lanesModel?.lanes.length < 2;
        },
      },
    ]);
  }

  private registerRoutes() {
    this.registerHostAspectRoutes();
    this.registerLanesRoutes();
  }

  getLanesSwitcher() {
    const mainIcon = () => {
      const scope = useContext(ScopeContext);
      return (
        <ScopeIcon
          size={24}
          scopeImage={scope.icon}
          bgColor={scope.backgroundIconColor}
          className={styles.mainLaneIcon}
        />
      );
    };

    const LanesSwitcher = (
      <LaneSwitcher
        groupByScope={this.lanesHost === 'workspace'}
        mainIcon={this.lanesHost === 'scope' ? mainIcon : undefined}
        // @ts-ignore @todo - fix this
        useLanes={useLanes}
      />
    );

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
    const ignoreFns = this.laneProviderIgnoreSlot.values();

    return <LanesProvider ignoreDerivingFromUrl={ignoreFns}>{children}</LanesProvider>;
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

  getLaneCompare = (props: LaneCompareProps) => {
    const tabs = this.componentCompareUI.tabs;

    if (!props.base || !props.compare) return null;

    return (
      <LaneCompare
        {...props}
        base={props.base}
        compare={props.compare}
        host={props.host || this.host}
        tabs={props.tabs || tabs}
      />
    );
  };

  static async provider(
    [uiUi, componentUI, workspaceUi, scopeUi, componentCompareUI, commandBarUI]: [
      UiUI,
      ComponentUI,
      WorkspaceUI,
      ScopeUI,
      ComponentCompareUI,
      CommandBarUI,
    ],
    _,
    [routeSlot, overviewSlot, navSlot, menuWidgetSlot, laneProviderIgnoreSlot]: [
      RouteSlot,
      LaneOverviewLineSlot,
      LanesOrderedNavigationSlot,
      MenuWidgetSlot,
      LaneProviderIgnoreSlot,
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
    const lanesUi = new LanesUI(
      componentUI,
      componentCompareUI,
      routeSlot,
      navSlot,
      menuWidgetSlot,
      overviewSlot,
      laneProviderIgnoreSlot,
      workspace,
      scope
    );
    if (uiUi) uiUi.registerRenderHooks({ reactContext: lanesUi.renderContext });
    lanesUi.registerRoutes();
    lanesUi.registerMenuWidget(() => {
      const { lanesModel } = useLanes();
      if (!lanesModel?.viewedLane) return null;
      const { viewedLane, currentLane } = lanesModel;
      return (
        <UseLaneMenu
          actionName={'Import'}
          actionIcon={'terminal'}
          host={lanesUi.lanesHost}
          viewedLaneId={viewedLane.id}
          currentLaneId={currentLane?.id}
        />
      );
    });
    lanesUi.registerLanesDropdown();
    if (workspace) {
      lanesUi.registerMenuWidget(commandBarUI.CommandBarButton);
    }
    return lanesUi;
  }
}

export default LanesUI;

LanesAspect.addRuntime(LanesUI);
