import React from 'react';
import type { RouteProps } from 'react-router-dom';
import flatten from 'lodash.flatten';
import type { Harmony, SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { ComponentUI } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { ComponentCompare } from '@teambit/component.ui.component-compare.component-compare';
import { UIRuntime } from '@teambit/ui';
import type { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import type {
  ComponentCompareProps,
  TabItem,
} from '@teambit/component.ui.component-compare.models.component-compare-props';
import { ComponentCompareChangelog } from '@teambit/component.ui.component-compare.changelog';
import { ComponentCompareAspects } from '@teambit/component.ui.component-compare.compare-aspects.compare-aspects';
import { AspectsCompareSection } from './component-compare-aspects.section';
import { ComponentCompareAspect } from './component-compare.aspect';
import { ComponentCompareSection } from './component-compare.section';
import { CompareChangelogSection } from './component-compare-changelog.section';

export type ComponentCompareNav = Array<TabItem>;
export type ComponentCompareNavSlot = SlotRegistry<ComponentCompareNav>;
export class ComponentCompareUI {
  constructor(
    private host: string,
    private navSlot: ComponentCompareNavSlot,
    private routeSlot: RouteSlot,
    private compUI: ComponentUI
  ) {}

  static runtime = UIRuntime;

  static slots = [Slot.withType<ComponentCompareNavSlot>(), Slot.withType<RouteSlot>()];

  static dependencies = [ComponentAspect];

  getComponentComparePage = (props?: ComponentCompareProps & { pinned?: boolean }) => {
    const tabs = props?.tabs || (() => flatten(this.navSlot.values()));
    const routes = props?.routes || (() => flatten(this.routeSlot.values()));
    const host = props?.host || this.host;

    return (
      <ComponentCompare
        {...(props || {})}
        tabs={tabs}
        routes={routes}
        host={host}
        isFullScreen={props?.isFullScreen ?? true}
      />
    );
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
    [navSlot, routeSlot]: [ComponentCompareNavSlot, RouteSlot],
    harmony: Harmony
  ) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    const componentCompareUI = new ComponentCompareUI(host, navSlot, routeSlot, componentUi);
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
