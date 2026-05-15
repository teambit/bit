import type { ReactNode } from 'react';
import React, { useContext } from 'react';
import type { RouteProps } from 'react-router-dom';
import { Route } from 'react-router-dom';
import type { Harmony, SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import { LaneCompare, type LaneCompareProps as DefaultLaneCompareProps } from '@teambit/lanes.ui.compare.lane-compare';
import type { UiUI } from '@teambit/ui';
import { UIRuntime, UIAspect } from '@teambit/ui';
import type { NavigationSlot, RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { NotFoundPage } from '@teambit/design.ui.pages.not-found';
import type { ScopeUI } from '@teambit/scope';
import { ScopeAspect, ScopeContext } from '@teambit/scope';
import type { WorkspaceUI } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { ComponentUI } from '@teambit/component';
import { ComponentAspect, useIdFromLocation, ComponentID } from '@teambit/component';
import { InlineCodeCompare } from '@teambit/code.ui.inline-code-compare';
import type { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { InlinePreviewCompare } from '@teambit/preview.ui.inline-preview-compare';
import { InlineDepsCompare } from '@teambit/review.ui.inline-deps-compare';
import { InlineTestsCompare } from '@teambit/review.ui.inline-tests-compare';
import { InlineConfigCompare } from '@teambit/review.ui.inline-config-compare';
import { flatten } from 'lodash';
import type { MenuWidget, MenuWidgetSlot } from '@teambit/ui-foundation.ui.menu';
import type { LaneOverviewLine, LaneOverviewLineSlot } from '@teambit/lanes.ui.lane-overview';
import { LaneOverview } from '@teambit/lanes.ui.lane-overview';
import type { LanesNavPlugin, LanesOrderedNavigationSlot } from '@teambit/lanes.ui.menus.lanes-overview-menu';
import { LanesOverviewMenu } from '@teambit/lanes.ui.menus.lanes-overview-menu';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { UseLaneMenu } from '@teambit/lanes.ui.menus.use-lanes-menu';
import type { LanesHost } from '@teambit/lanes.ui.models.lanes-model';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import type { IgnoreDerivingFromUrl } from '@teambit/lanes.hooks.use-lanes';
import { LanesProvider, useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneSwitcher } from '@teambit/lanes.ui.navigation.lane-switcher';
import { useViewedLaneFromUrl } from '@teambit/lanes.hooks.use-viewed-lane-from-url';
import type { ComponentCompareUI } from '@teambit/component-compare';
import { ComponentCompareAspect } from '@teambit/component-compare';
import { LaneComparePage } from '@teambit/lanes.ui.compare.lane-compare-page';
import { ScopeIcon } from '@teambit/scope.ui.scope-icon';
import type { CommandBarUI } from '@teambit/command-bar';
import { CommandBarAspect } from '@teambit/command-bar';

import { LanesAspect } from './lanes.aspect';
import styles from './lanes.ui.module.scss';

export type LaneCompareProps = Partial<DefaultLaneCompareProps>;
export type LaneProviderIgnoreSlot = SlotRegistry<IgnoreDerivingFromUrl>;

/**
 * Stable, module-scope tabs list. Previously this array (and the `React.createElement(...)` for each
 * tab's element) was constructed inside `getLaneCompare`, which means every render produced a new
 * array and new tab-element references. Those flowed into `<LaneCompare tabs={...}>` → `resolvedTabs`
 * (useMemo keyed on input ref) → new value → new `allTabs` prop on every `InlineComponentCompare`,
 * defeating React.memo and forcing all 10 component panels (and their nested tabs) to re-render on
 * every parent re-render — including every `setViewMode` click. Hoisting the array to module scope
 * gives a single stable reference that survives any number of parent renders.
 */
/**
 * Fallback compare-tab list. Each tab here should ideally be registered by its *owning* aspect
 * via `LanesUI.registerCompareTab(...)` so that lanes itself doesn't have to import the inline
 * components. We keep these as fallbacks for tabs whose owners don't yet have a UI runtime in
 * this repo (preview, review). The docs tab is intentionally absent — it's registered by the
 * docs aspect with its real `titleBadges` / `overviewOptions` slots.
 *
 * TODO: move each entry below to its respective aspect (code, preview, review) and delete this.
 */
const FALLBACK_COMPARE_TABS: TabItem[] = [
  { id: 'inline-code', order: 1, displayName: 'Code', element: React.createElement(InlineCodeCompare) },
  { id: 'inline-preview', order: 2, displayName: 'Preview', element: React.createElement(InlinePreviewCompare) },
  { id: 'inline-deps', order: 4, displayName: 'Dependencies', element: React.createElement(InlineDepsCompare) },
  { id: 'inline-tests', order: 5, displayName: 'Tests', element: React.createElement(InlineTestsCompare) },
  { id: 'inline-config', order: 6, displayName: 'Configuration', element: React.createElement(InlineConfigCompare) },
];

/**
 * Slot signature for `LanesUI.registerCompareTab`. Aspects can register either a single tab or
 * an array. The registrar carries a stable reference per registration so the resolved tab list
 * stays stable across renders.
 */
export type LaneCompareTabSlot = SlotRegistry<TabItem | TabItem[]>;

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
    Slot.withType<TabItem | TabItem[]>(),
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
    /**
     * compare-tab slot. Aspects register their inline-compare tab via `registerCompareTab(...)`;
     * the registered tabs are merged with the local fallback list, deduped by `id`, and sorted
     * by `order` before being passed to `<LaneCompare>`.
     */
    private compareTabSlot: LaneCompareTabSlot,
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
      getLaneIdFromPathname: typeof LanesModel.getLaneIdFromPathname;
      getLaneUrl: typeof LanesModel.getLaneUrl;
      getLaneComponentUrl: typeof LanesModel.getLaneComponentUrl;
    }
  ) {
    const { prefix, path, getLaneComponentUrl, getLaneIdFromPathname, getLaneUrl } = fn();
    LanesModel.lanesPrefix = prefix;
    LanesModel.lanePath = path;
    LanesModel.getLaneComponentUrl = getLaneComponentUrl;
    LanesModel.getLaneUrl = getLaneUrl;
    LanesModel.getLaneIdFromPathname = getLaneIdFromPathname;
  }

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

  /**
   * Register an inline compare tab. Aspects own their compare-tab entry and call this in their
   * own UI provider (e.g. the docs aspect registers `inline-docs` so it can pass its real
   * `titleBadges` / `overviewOptions` slots). Tabs are merged with the lanes-side fallback list,
   * deduped by `id`, and sorted by `order` at render time.
   */
  registerCompareTab(tab: TabItem | TabItem[]) {
    this.compareTabSlot.register(tab);
    return this;
  }

  // memoize the resolved tab list — same identity across renders unless a new registration lands.
  private _resolvedCompareTabs?: TabItem[];
  private _resolvedCompareTabsKey?: number;
  private resolveCompareTabs(): TabItem[] {
    const slotEntries = this.compareTabSlot.toArray();
    if (this._resolvedCompareTabs && this._resolvedCompareTabsKey === slotEntries.length) {
      return this._resolvedCompareTabs;
    }
    const registered = flatten(slotEntries.map(([, value]) => value).filter(Boolean) as Array<TabItem | TabItem[]>);
    const registeredIds = new Set(registered.map((t) => t.id));
    // registered tabs take precedence; fallbacks fill any id the slot didn't provide.
    const merged = [...registered, ...FALLBACK_COMPARE_TABS.filter((t) => !registeredIds.has(t.id))].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
    this._resolvedCompareTabs = merged;
    this._resolvedCompareTabsKey = slotEntries.length;
    return merged;
  }

  getLaneCompare = (props: LaneCompareProps) => {
    if (!props.base || !props.compare) return null;

    return (
      <LaneCompare
        {...props}
        base={props.base}
        compare={props.compare}
        host={props.host || this.host}
        tabs={props.tabs || this.resolveCompareTabs()}
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
    [routeSlot, overviewSlot, navSlot, menuWidgetSlot, laneProviderIgnoreSlot, compareTabSlot]: [
      RouteSlot,
      LaneOverviewLineSlot,
      LanesOrderedNavigationSlot,
      MenuWidgetSlot,
      LaneProviderIgnoreSlot,
      LaneCompareTabSlot,
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
      compareTabSlot,
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
