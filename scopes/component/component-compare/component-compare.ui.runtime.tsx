import { staticStorageUrl } from '@teambit/base-ui.constants.storage';
import { NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import { FileIconSlot } from '@teambit/code';
import type { FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import { ComponentCompare } from '@teambit/component.ui.component-compare';
import { ComponentCompareAspects } from '@teambit/component.ui.component-compare-aspects';
import { ComponentCompareCode } from '@teambit/component.ui.component-compare-code';
import { ComponentCompareComposition } from '@teambit/component.ui.component-compare-composition';
import { ComponentCompareDependencies } from '@teambit/component.ui.component-compare-dependencies';
import ComponentAspect from '@teambit/component/component.aspect';
import ComponentUI from '@teambit/component/component.ui.runtime';
import { EmptyStateSlot } from '@teambit/compositions';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { AddingCompositions } from '@teambit/react.instructions.react.adding-compositions';
import ScopeAspect from '@teambit/scope';
import { UIRuntime } from '@teambit/ui';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import WorkspaceAspect from '@teambit/workspace';
import React, { ComponentType } from 'react';
import { RouteProps } from 'react-router-dom';
import { ComponentCompareAspect } from './component-compare.aspect';
import { ComponentCompareSection } from './component-compare.section';

export type ComponentCompareNav = {
  props: NavLinkProps;
  order: number;
};

export type ComponentCompareNavSlot = SlotRegistry<Array<ComponentCompareNav>>;
const isTsx = /\.tsx$/;

export class ComponentCompareUI {
  constructor(
    private host: string,
    private navSlot: ComponentCompareNavSlot,
    private routeSlot: RouteSlot,
    private emptyStateSlot: EmptyStateSlot,
    private fileIconSlot?: FileIconSlot
  ) {}

  static runtime = UIRuntime;

  static slots = [Slot.withType<ComponentCompareNavSlot>(), Slot.withType<RouteSlot>(), Slot.withType<string>()];

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

  registerEnvFileIcon(icons: FileIconMatch[]) {
    this.fileIconSlot?.register(icons);
    return this;
  }

  /**
   * register a new tester empty state. this allows to register a different empty state from each environment for example.
   */
  registerEmptyState(emptyStateComponent: ComponentType) {
    this.emptyStateSlot.register(emptyStateComponent);
    return this;
  }

  getComponentCodeComparePage() {
    return <ComponentCompareCode fileIconSlot={this.fileIconSlot} />;
  }

  getComponentDependenciesComparePage() {
    return <ComponentCompareDependencies />;
  }

  getComponentCompositionComparePage() {
    return <ComponentCompareComposition emptyState={this.emptyStateSlot} />;
  }

  getComponentAspectsComparePage() {
    return <ComponentCompareAspects />;
  }

  private compareRoutes: RouteProps[] = [
    {
      exact: true,
      path: '',
      children: () => this.getComponentCompositionComparePage(),
    },
    {
      exact: true,
      path: '/compositions',
      children: () => this.getComponentCompositionComparePage(),
    },
    {
      exact: true,
      path: '/code',
      children: () => this.getComponentCodeComparePage(),
    },
    {
      exact: true,
      path: '/dependencies',
      children: () => this.getComponentDependenciesComparePage(),
    },
    {
      exact: true,
      path: '/aspects',
      children: () => this.getComponentAspectsComparePage(),
    },
  ];

  private compareNavLinks: ComponentCompareNav[] = [
    {
      props: {
        href: '/compositions',
        children: 'Compositions',
      },
      order: 0,
    },
    {
      props: {
        href: '/code',
        children: 'Code',
      },
      order: 1,
    },
    {
      props: {
        href: '/dependencies',
        children: 'Dependencies',
      },
      order: 2,
    },
    {
      props: {
        href: '/aspects',
        children: 'Aspects',
      },
      order: 3,
    },
  ];

  static async provider(
    [componentUi]: [ComponentUI],
    _,
    [navSlot, routeSlot, emptyStateSlot, fileIconSlot]: [
      ComponentCompareNavSlot,
      RouteSlot,
      EmptyStateSlot,
      FileIconSlot
    ],
    harmony: Harmony
  ) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    const componentCompareUI = new ComponentCompareUI(host, navSlot, routeSlot, emptyStateSlot, fileIconSlot);
    componentCompareUI.registerInternalRoutes();
    // overrides the default tsx react icon with the typescript icon
    componentCompareUI.registerEnvFileIcon([
      (fileName) => (isTsx.test(fileName) ? `${staticStorageUrl}/file-icons/file_type_typescript.svg` : undefined),
    ]);
    componentCompareUI.registerEmptyState(() => {
      return <AddingCompositions />;
    });
    const componentCompareSection = new ComponentCompareSection(componentCompareUI);
    componentUi.registerRoute([componentCompareSection.route]);
    componentUi.registerWidget(componentCompareSection.navigationLink, componentCompareSection.order);
    return componentCompareUI;
  }
}

ComponentCompareAspect.addRuntime(ComponentCompareUI);
