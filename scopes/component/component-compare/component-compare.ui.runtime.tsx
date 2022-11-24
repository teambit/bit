import { NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import ComponentAspect, { ComponentUI } from '@teambit/component';
import { ComponentCompare, ComponentCompareProps } from '@teambit/component.ui.component-compare.component-compare';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import React from 'react';
import { RouteProps } from 'react-router-dom';
import flatten from 'lodash.flatten';
import { AspectsCompareSection } from './component-compare-aspects.section';
import { ComponentCompareAspect } from './component-compare.aspect';
import { ComponentCompareSection } from './component-compare.section';
import { CompareChangelogSection } from './component-compare-changelog.section';

export type ComponentCompareNav = {
  props: NavLinkProps;
  order: number;
};

export type ComponentCompareNavSlot = SlotRegistry<Array<ComponentCompareNav>>;
export class ComponentCompareUI {
  constructor(private host: string, private navSlot: ComponentCompareNavSlot, private routeSlot: RouteSlot) {}

  static runtime = UIRuntime;

  static slots = [Slot.withType<ComponentCompareNavSlot>(), Slot.withType<RouteSlot>()];

  static dependencies = [ComponentAspect];

  getComponentComparePage = (props?: ComponentCompareProps) => {
    const tabs = props?.tabs || (() => flatten(this.navSlot.values()));
    const routes = props?.routes || (() => flatten(this.routeSlot.values()));
    const host = props?.host || this.host;

    return <ComponentCompare {...(props || {})} tabs={tabs} routes={routes} host={host} />;
  };

  registerNavigation(route: ComponentCompareNav | Array<ComponentCompareNav>) {
    if (Array.isArray(route)) {
      this.navSlot.register(route);
    } else {
      this.navSlot.register([route]);
    }
    return this;
  }

  registerRoutes(routes: RouteProps[]) {
    this.routeSlot.register(routes);
    return this;
  }

  static async provider(
    [componentUi]: [ComponentUI],
    _,
    [navSlot, routeSlot]: [ComponentCompareNavSlot, RouteSlot],
    harmony: Harmony
  ) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    const componentCompareUI = new ComponentCompareUI(host, navSlot, routeSlot);
    const componentCompareSection = new ComponentCompareSection(componentCompareUI);
    componentUi.registerRoute([componentCompareSection.route]);
    componentUi.registerWidget(componentCompareSection.navigationLink, componentCompareSection.order);
    const aspectCompareSection = new AspectsCompareSection(host);
    const compareChangelog = new CompareChangelogSection();
    componentCompareUI.registerNavigation([
      {
        props: aspectCompareSection.navigationLink,
        order: aspectCompareSection.navigationLink.order,
      },
      {
        props: compareChangelog.navigationLink,
        order: compareChangelog.navigationLink.order,
      },
    ]);

    componentCompareUI.registerRoutes([aspectCompareSection.route, compareChangelog.route]);
    return componentCompareUI;
  }
}

ComponentCompareAspect.addRuntime(ComponentCompareUI);
