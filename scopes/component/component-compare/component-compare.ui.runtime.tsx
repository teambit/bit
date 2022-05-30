import { NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import ComponentAspect, { ComponentUI } from '@teambit/component';
import { ComponentCompare } from '@teambit/component.ui.component-compare';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import React from 'react';
import { RouteProps } from 'react-router-dom';
import { AspectsCompareSection } from './component-compare-aspects.section';
import { ComponentCompareAspect } from './component-compare.aspect';
import { ComponentCompareSection } from './component-compare.section';

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

  getComponentComparePage = () => (
    <ComponentCompare navSlot={this.navSlot} routeSlot={this.routeSlot} host={this.host} />
  );

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
    componentCompareUI.registerNavigation({
      props: { ...aspectCompareSection.navigationLink },
      order: aspectCompareSection.navigationLink.order,
    });
    componentCompareUI.registerRoutes([aspectCompareSection.route]);
    return componentCompareUI;
  }
}

ComponentCompareAspect.addRuntime(ComponentCompareUI);
