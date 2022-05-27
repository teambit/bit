import { staticStorageUrl } from '@teambit/base-ui.constants.storage';
import { NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import { FileIconSlot } from '@teambit/code';
import type { FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import ComponentAspect, { ComponentUI } from '@teambit/component';
import { ComponentCompare } from '@teambit/component.ui.component-compare';
import { ComponentCompareAspects } from '@teambit/component.ui.component-compare-aspects';
import { ComponentCompareCode } from '@teambit/component.ui.component-compare-code';
import { ComponentCompareComposition } from '@teambit/component.ui.component-compare-composition';
import { ComponentCompareDependencies } from '@teambit/component.ui.component-compare-dependencies';
import { ComponentCompareOverview } from '@teambit/component.ui.component-compare-overview';
import { ComponentCompareTests } from '@teambit/component.ui.component-compare-tests';
import type { TitleBadge } from '@teambit/component.ui.component-meta';
import { EmptyStateSlot } from '@teambit/compositions';
import { TitleBadgeSlot } from '@teambit/docs';
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
    private titleBadgeSlot: TitleBadgeSlot,
    private fileIconSlot?: FileIconSlot
  ) {}

  static runtime = UIRuntime;

  static slots = [
    Slot.withType<ComponentCompareNavSlot>(),
    Slot.withType<RouteSlot>(),
    Slot.withType<string>(),
    Slot.withType<TitleBadge>(),
  ];

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

  registerTitleBadge(titleBadges: TitleBadge[]) {
    this.titleBadgeSlot.register(titleBadges);
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
    return <ComponentCompareAspects host={this.host} />;
  }

  getComponentOverviewComparePage() {
    return <ComponentCompareOverview titleBadges={this.titleBadgeSlot} />;
  }

  getComponentTestsComparePage() {
    return <ComponentCompareTests />;
  }

  private compareRoutes: RouteProps[] = [
    {
      index: true,
      path: '*',
      element: this.getComponentOverviewComparePage(),
    },
    {
      path: 'compositions/*',
      element: this.getComponentCompositionComparePage(),
    },
    {
      path: 'code/*',
      element: this.getComponentCodeComparePage(),
    },
    {
      path: 'dependencies/*',
      element: this.getComponentDependenciesComparePage(),
    },
    {
      path: 'aspects/*',
      element: this.getComponentAspectsComparePage(),
    },
    {
      path: 'tests/*',
      element: this.getComponentTestsComparePage(),
    },
  ];

  private compareNavLinks: ComponentCompareNav[] = [
    {
      props: {
        href: '.',
        exact: true,
        children: 'Overview',
      },
      order: 0,
    },
    {
      props: {
        href: 'compositions',
        exact: true,
        children: 'Compositions',
      },
      order: 1,
    },
    {
      props: {
        href: 'code',
        children: 'Code',
      },
      order: 2,
    },
    {
      props: {
        href: 'dependencies',
        children: 'Dependencies',
      },
      order: 3,
    },
    {
      props: {
        href: 'aspects',
        children: 'Aspects',
      },
      order: 4,
    },
    {
      props: {
        href: 'tests',
        children: 'Tests',
      },
      order: 5,
    },
  ];

  static async provider(
    [componentUi]: [ComponentUI],
    _,
    [navSlot, routeSlot, emptyStateSlot, titleBadgeSlot, fileIconSlot]: [
      ComponentCompareNavSlot,
      RouteSlot,
      EmptyStateSlot,
      TitleBadgeSlot,
      FileIconSlot
    ],
    harmony: Harmony
  ) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    const componentCompareUI = new ComponentCompareUI(
      host,
      navSlot,
      routeSlot,
      emptyStateSlot,
      titleBadgeSlot,
      fileIconSlot
    );
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
