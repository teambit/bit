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
import { InlineCodeCompare } from '@teambit/code.ui.inline-code-compare';
import { InlinePreviewCompare } from '@teambit/preview.ui.inline-preview-compare';
import { InlineDepsCompare } from '@teambit/review.ui.inline-deps-compare';
import { InlineTestsCompare } from '@teambit/review.ui.inline-tests-compare';
import { InlineConfigCompare } from '@teambit/review.ui.inline-config-compare';
import { AspectsCompareSection } from './component-compare-aspects.section';
import { ComponentCompareAspect } from './component-compare.aspect';
import { ComponentCompareSection } from './component-compare.section';
import { CompareChangelogSection } from './component-compare-changelog.section';
import { ComponentComparePage } from './component-compare-page';

export type ComponentCompareNav = Array<TabItem>;
export type ComponentCompareNavSlot = SlotRegistry<ComponentCompareNav>;

/**
 * Inline-compare tabs are stacked in the new ComponentComparePage and shown/hidden by the
 * toolbar via `data-view-mode` CSS rules. Aspects can register their own via
 * `ComponentCompareUI.registerCompareTab(...)`. These fallbacks fill any id the slot didn't
 * provide so the page is usable out of the box. (Owned by component-compare so single-component
 * and lane-compare share the same list; lane-compare delegates here.)
 */
const FALLBACK_COMPARE_TABS: TabItem[] = [
  { id: 'inline-code', order: 1, displayName: 'Code', element: React.createElement(InlineCodeCompare) },
  { id: 'inline-preview', order: 2, displayName: 'Preview', element: React.createElement(InlinePreviewCompare) },
  { id: 'inline-deps', order: 4, displayName: 'Dependencies', element: React.createElement(InlineDepsCompare) },
  { id: 'inline-tests', order: 5, displayName: 'Tests', element: React.createElement(InlineTestsCompare) },
  { id: 'inline-config', order: 6, displayName: 'Configuration', element: React.createElement(InlineConfigCompare) },
];

export type ComponentCompareTabSlot = SlotRegistry<TabItem | TabItem[]>;

export class ComponentCompareUI {
  constructor(
    private host: string,
    private navSlot: ComponentCompareNavSlot,
    private routeSlot: RouteSlot,
    private compareTabSlot: ComponentCompareTabSlot,
    private compUI: ComponentUI
  ) {}

  static runtime = UIRuntime;

  static slots = [
    Slot.withType<ComponentCompareNavSlot>(),
    Slot.withType<RouteSlot>(),
    Slot.withType<TabItem | TabItem[]>(),
  ];

  static dependencies = [ComponentAspect];

  getComponentComparePage = (props?: ComponentCompareProps & { pinned?: boolean }) => {
    const tabs = props?.tabs || (() => this.resolveCompareTabs());
    const host = props?.host || this.host;
    return <ComponentComparePage tabs={tabs} host={host} />;
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

  private _resolvedCompareTabs?: TabItem[];
  private _resolvedCompareTabsKey?: number;
  /**
   * Merge slot-registered tabs with the fallbacks, dedup by id (registered wins), sort by order.
   * Memoized by slot-entry count so the resolved list keeps stable identity across renders.
   */
  resolveCompareTabs(): TabItem[] {
    const slotEntries = this.compareTabSlot.toArray();
    if (this._resolvedCompareTabs && this._resolvedCompareTabsKey === slotEntries.length) {
      return this._resolvedCompareTabs;
    }
    const registered = flatten(slotEntries.map(([, value]) => value).filter(Boolean) as Array<TabItem | TabItem[]>);
    const registeredIds = new Set(registered.map((t) => t.id));
    const merged = [...registered, ...FALLBACK_COMPARE_TABS.filter((t) => !registeredIds.has(t.id))].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
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

  get tabs() {
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
    [navSlot, routeSlot, compareTabSlot]: [ComponentCompareNavSlot, RouteSlot, ComponentCompareTabSlot],
    harmony: Harmony
  ) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    const componentCompareUI = new ComponentCompareUI(host, navSlot, routeSlot, compareTabSlot, componentUi);
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
