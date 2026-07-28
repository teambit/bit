import React from 'react';
import type { RouteProps } from 'react-router-dom';
import flatten from 'lodash.flatten';
import type { Harmony, SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { ComponentUI } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import type { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import type {
  ComponentCompareProps,
  TabItem,
} from '@teambit/component.ui.component-compare.models.component-compare-props';
import { ComponentCompareChangelog } from '@teambit/component.ui.component-compare.changelog';
import { ComponentCompareAspects } from '@teambit/component.ui.component-compare.compare-aspects.compare-aspects';
import type { ApiDiffInsight } from '@teambit/semantics.ui.api-diff-view';
import { AspectsCompareSection } from './component-compare-aspects.section';
import { ComponentCompareAspect } from './component-compare.aspect';
import { ComponentCompareSection } from './component-compare.section';
import { CompareChangelogSection } from './component-compare-changelog.section';
import { ComponentComparePage } from './component-compare-page';

export type ComponentCompareNav = Array<TabItem>;
export type ComponentCompareNavSlot = SlotRegistry<ComponentCompareNav>;

export type ComponentCompareTabSlot = SlotRegistry<TabItem | TabItem[]>;

export type ApiDiffInsightSlot = SlotRegistry<ApiDiffInsight | ApiDiffInsight[]>;

export class ComponentCompareUI {
  constructor(
    private host: string,
    private navSlot: ComponentCompareNavSlot,
    private routeSlot: RouteSlot,
    private compareTabSlot: ComponentCompareTabSlot,
    private apiDiffInsightSlot: ApiDiffInsightSlot,
    private compUI: ComponentUI
  ) {}

  static runtime = UIRuntime;

  static slots = [
    Slot.withType<ComponentCompareNavSlot>(),
    Slot.withType<RouteSlot>(),
    Slot.withType<TabItem | TabItem[]>(),
    Slot.withType<ApiDiffInsight | ApiDiffInsight[]>(),
  ];

  static dependencies = [ComponentAspect];

  getComponentComparePage = (props?: ComponentCompareProps & { pinned?: boolean }) => {
    const tabs = props?.tabs || (() => this.resolveCompareTabs());
    const host = props?.host || this.host;
    // The API compare tab is contributed by the api-reference aspect via `registerNavigation`
    // (navSlot), which the redesign page's view-mode toolbar doesn't read. Hand it the API element
    // lazily so it's resolved at render time — after every aspect's UI provider has registered,
    // regardless of provider order — and rendered as a page-local `api` view mode.
    const getApiTab = () => this.tabs.find((tab) => tab.id === 'api')?.element;
    return <ComponentComparePage tabs={tabs} host={host} getApiTab={getApiTab} />;
  };

  getAspectsComparePage = () => {
    return <ComponentCompareAspects host={this.host} />;
  };

  getChangelogComparePage = () => {
    return <ComponentCompareChangelog />;
  };

  registerNavigation(nav: TabItem | Array<TabItem>) {
    if (Array.isArray(nav)) {
      this.navSlot.register(nav);
    } else {
      this.navSlot.register([nav]);
    }
    return this;
  }

  registerRoutes(routes: RouteProps[]) {
    this.routeSlot.register(routes);
    return this;
  }

  /**
   * Register an inline-compare tab. The tab's `id` should match the new toolbar view-mode ids
   * (`inline-code`, `inline-preview`, `inline-docs`, `inline-deps`, `inline-tests`, `inline-config`).
   * Used by both the single-component compare page and lane-compare.
   */
  registerCompareTab(tab: TabItem | TabItem[]) {
    this.compareTabSlot.register(tab);
    return this;
  }

  /**
   * contribute intelligence to the API diff view: per-change renderers for migration
   * hints, affected dependents, codemods, etc. rendered in each change block's
   * insights area (lane compare API view and the single-component API tab).
   */
  registerApiDiffInsight(insight: ApiDiffInsight | ApiDiffInsight[]) {
    this.apiDiffInsightSlot.register(insight);
    return this;
  }

  private _resolvedApiDiffInsights?: ApiDiffInsight[];
  private _resolvedApiDiffInsightsKey?: number;
  /**
   * Memoized by slot-entry count (mirroring `resolveCompareTabs`) so the returned array keeps a
   * stable identity across renders — `LaneCompare` is React.memo'd, and a fresh array on every
   * call would break its shallow compare and re-render the whole compare tree.
   */
  getApiDiffInsights(): ApiDiffInsight[] {
    const slotEntries = this.apiDiffInsightSlot.toArray();
    if (this._resolvedApiDiffInsights && this._resolvedApiDiffInsightsKey === slotEntries.length) {
      return this._resolvedApiDiffInsights;
    }
    this._resolvedApiDiffInsights = flatten(
      slotEntries.map(([, value]) => value) as Array<ApiDiffInsight | ApiDiffInsight[]>
    );
    this._resolvedApiDiffInsightsKey = slotEntries.length;
    return this._resolvedApiDiffInsights;
  }

  private _resolvedCompareTabs?: TabItem[];
  private _resolvedCompareTabsKey?: number;
  /**
   * Resolve the inline-compare tabs that aspects register via `registerCompareTab` (code →
   * inline-code/deps/tests/config, compositions → inline-preview, docs → inline-docs, …). Dedup by
   * id (first registration wins), sort by order. Memoized by slot-entry count so the resolved list
   * keeps a stable identity across renders. Owning each tab in its aspect keeps component-compare
   * decoupled from code/preview/docs UI; single-component compare and lane-compare both read this.
   */
  resolveCompareTabs(): TabItem[] {
    const slotEntries = this.compareTabSlot.toArray();
    if (this._resolvedCompareTabs && this._resolvedCompareTabsKey === slotEntries.length) {
      return this._resolvedCompareTabs;
    }
    const registered = flatten(slotEntries.map(([, value]) => value).filter(Boolean) as Array<TabItem | TabItem[]>);
    const seen = new Set<string>();
    const deduped = registered.filter((tab) => (seen.has(tab.id) ? false : (seen.add(tab.id), true)));
    const merged = deduped.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this._resolvedCompareTabs = merged;
    this._resolvedCompareTabsKey = slotEntries.length;
    return merged;
  }

  get routes() {
    return this.routeSlot.map;
  }

  get navLinks() {
    return this.navSlot.map;
  }

  get tabs(): TabItem[] {
    const getElement = (routeProps: RouteProps[], href?: string) => {
      if (routeProps.length === 1) return routeProps[0].element;
      if (!href) return undefined;
      return routeProps.find((route) => route.path?.startsWith(href))?.element;
    };

    return flatten(
      this.navSlot.toArray().map(([id, navProps]) => {
        const maybeRoutesForId = this.routes.get(id);
        const routesForId =
          (maybeRoutesForId && (Array.isArray(maybeRoutesForId) ? [...maybeRoutesForId] : [maybeRoutesForId])) || [];

        return navProps.map((navProp) => ({
          ...navProp,
          id: navProp?.id || id,
          element: getElement(routesForId, navProp?.props?.href),
        }));
      })
    );
  }

  static async provider(
    [componentUi]: [ComponentUI],
    _,
    [navSlot, routeSlot, compareTabSlot, apiDiffInsightSlot]: [
      ComponentCompareNavSlot,
      RouteSlot,
      ComponentCompareTabSlot,
      ApiDiffInsightSlot,
    ],
    harmony: Harmony
  ) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    const componentCompareUI = new ComponentCompareUI(
      host,
      navSlot,
      routeSlot,
      compareTabSlot,
      apiDiffInsightSlot,
      componentUi
    );
    const componentCompareSection = new ComponentCompareSection(componentCompareUI, false);
    const pinnedComponentCompareSection = new ComponentCompareSection(componentCompareUI, true);
    componentUi.registerRoute([componentCompareSection.route]);
    componentUi.registerWidget(componentCompareSection.navigationLink, componentCompareSection.order);
    componentUi.registerPinnedWidget(pinnedComponentCompareSection.navigationLink, pinnedComponentCompareSection.order);
    const aspectCompareSection = new AspectsCompareSection(componentCompareUI);
    const compareChangelog = new CompareChangelogSection(componentCompareUI);
    componentCompareUI.registerNavigation([aspectCompareSection, compareChangelog]);
    componentCompareUI.registerRoutes([aspectCompareSection.route, compareChangelog.route]);
    return componentCompareUI;
  }
}

ComponentCompareAspect.addRuntime(ComponentCompareUI);
