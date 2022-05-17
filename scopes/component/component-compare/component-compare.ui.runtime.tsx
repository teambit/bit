import React from 'react';
import { RouteProps } from 'react-router-dom';
import ComponentAspect from '@teambit/component/component.aspect';
import ComponentUI from '@teambit/component/component.ui.runtime';
import { Slot, SlotRegistry, Harmony } from '@teambit/harmony';
import ScopeAspect from '@teambit/scope';
import { UIRuntime } from '@teambit/ui';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import WorkspaceAspect from '@teambit/workspace';
import { ComponentCompare } from '@teambit/component.ui.component-compare';

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

  static dependencies = [ComponentAspect, WorkspaceAspect, ScopeAspect];

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

  registerInternalRoutes() {
    this.registerNavigation(this.compareNavLinks).registerRoutes(this.compareRoutes);
    return this;
  }

  getComponentCodeComparePage() {
    return null;
  }

  getComponentDependenciesComparePage() {
    return null;
  }

  getComponentCompositionComparePage() {
    return null;
  }

  getComponentAspectsComparePage() {
    return null;
  }

  private compareRoutes: RouteProps[] = [
    {
      path: '',
      children: () => this.getComponentCompositionComparePage(),
    },
    {
      path: '/~compositions',
      children: () => this.getComponentCompositionComparePage(),
    },
    {
      path: '/~code',
      children: () => this.getComponentCodeComparePage(),
    },
    {
      path: '/~dependencies',
      children: () => this.getComponentDependenciesComparePage(),
    },
    {
      path: '/~aspects',
      children: () => this.getComponentAspectsComparePage(),
    },
  ];

  private compareNavLinks: ComponentCompareNav[] = [
    {
      props: {
        href: '~compare',
        children: 'Compositions',
      },
      order: 0,
    },
    {
      props: {
        href: '~compare/~code',
        children: 'Code',
      },
      order: 1,
    },
    {
      props: {
        href: '~compare/~dependencies',
        children: 'Dependencies',
      },
      order: 2,
    },
    {
      props: {
        href: '~compare/~aspects',
        children: 'Aspects',
      },
      order: 3,
    },
  ];

  static async provider(
    [componentUi]: [ComponentUI],
    _,
    [navSlot, routeSlot]: [ComponentCompareNavSlot, RouteSlot],
    harmony: Harmony
  ) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    const componentCompareUI = new ComponentCompareUI(host, navSlot, routeSlot);
    componentCompareUI.registerInternalRoutes();
    const componentCompareSection = new ComponentCompareSection(componentCompareUI);
    componentUi.registerRoute([componentCompareSection.route]);
    componentUi.registerWidget(componentCompareSection.navigationLink, componentCompareSection.order);
    return componentCompareUI;
  }
}

ComponentCompareAspect.addRuntime(ComponentCompareUI);
