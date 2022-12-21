import React from 'react';
import { RouteProps } from 'react-router-dom';
import flatten from 'lodash.flatten';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import ComponentAspect, { ComponentUI } from '@teambit/component';
import { ComponentCompare } from '@teambit/component.ui.component-compare.component-compare';
import { UIRuntime } from '@teambit/ui';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { ComponentCompareProps, TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { ComponentCompareChangelog } from '@teambit/component.ui.component-compare.changelog';
import { ComponentCompareAspects } from '@teambit/component.ui.component-compare.compare-aspects.compare-aspects';
import { AspectsCompareSection } from './component-compare-aspects.section';
import { ComponentCompareAspect } from './component-compare.aspect';
import { ComponentCompareSection } from './component-compare.section';
import { CompareChangelogSection } from './component-compare-changelog.section';

export type ComponentCompareNav = Array<TabItem>;
export type ComponentCompareNavSlot = SlotRegistry<ComponentCompareNav>;
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
    const aspectCompareSection = new AspectsCompareSection(componentCompareUI);
    const compareChangelog = new CompareChangelogSection(componentCompareUI);

    componentCompareUI.registerNavigation([aspectCompareSection, compareChangelog]);

    componentCompareUI.registerRoutes([aspectCompareSection.route, compareChangelog.route]);
    return componentCompareUI;
  }
}

ComponentCompareAspect.addRuntime(ComponentCompareUI);
