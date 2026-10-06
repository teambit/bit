import React from 'react';
import flatten from 'lodash.flatten';
import copy from 'copy-to-clipboard';
import type { RouteProps } from 'react-router-dom';
import type { LinkProps } from '@teambit/base-react.navigation.link';
import { DeprecationIcon } from '@teambit/component.ui.deprecation-icon';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { ReactRouterUI } from '@teambit/react-router';
import { ReactRouterAspect } from '@teambit/react-router';
import { UIRuntime } from '@teambit/harmony.modules.runtimes';
import { groupBy } from 'lodash';
import type { MenuItem, MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import type { NavigationSlot, RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { Import } from '@teambit/ui-foundation.ui.use-box.menu';
import { snapToSemver } from '@teambit/component-package-version';
import { AspectSection } from './aspect.section';
import { ComponentAspect } from './component.aspect';
import type { ComponentModel } from './ui';
import type { ComponentPageElement, ComponentPageSlot } from './ui/component';
import { Component } from './ui/component';
import type { ComponentResultPlugin } from './ui/component-searcher';
import { ComponentSearcher } from './ui/component-searcher';
import type {
  ConsumeMethodSlot,
  ConsumePlugin,
  NavPlugin,
  OrderedNavigationSlot,
  RightSideMenuItem,
  RightSideMenuSlot,
} from './ui/menu';
import { ComponentMenu } from './ui/menu';
import type { GetComponentsOptions } from './get-component-opts';

export type ComponentSearchResultSlot = SlotRegistry<ComponentResultPlugin[]>;

export type ComponentUIConfig = {
  commandBar: boolean;
};

/**
 * a command the component page offers to the command bar (the shape of the command-bar's `CommandEntry`).
 */
export type ComponentCommand = {
  id: string;
  action: () => void;
  keybinding?: string | string[];
  displayName: string;
};

export type CommandRunner = (commandId: string) => unknown;

export type Server = {
  env: string;
  url: string;
};

export type ComponentMeta = {
  id: string;
};

export class ComponentUI {
  readonly routePath = `/*`;
  readonly componentSearcher: ComponentSearcher;

  constructor(
    private routeSlot: RouteSlot,

    private navSlot: OrderedNavigationSlot,

    readonly consumeMethodSlot: ConsumeMethodSlot,
    /**
     * slot for registering a new widget to the menu.
     */
    private widgetSlot: OrderedNavigationSlot,
    /**
     * slot for registering pinned widgets to the menu
     */
    private pinnedWidgetSlot: OrderedNavigationSlot,
    /**
     * slot for registering the right section of the menu
     */
    private rightSideMenuSlot: RightSideMenuSlot,

    private menuItemSlot: MenuItemSlot,

    private pageItemSlot: ComponentPageSlot,

    private componentSearchResultSlot: ComponentSearchResultSlot,

    reactRouterUi: ReactRouterUI,

    /**
     * whether the component page offers its commands and component search to the command bar
     */
    readonly isCommandBarEnabled = true
  ) {
    this.componentSearcher = new ComponentSearcher({ navigate: reactRouterUi.navigateTo });
  }

  get routes() {
    return this.routeSlot
      .toArray()
      .map(([key, routes]) => [key, Array.isArray(routes) ? [...flatten(routes)] : [routes]] as [string, RouteProps[]]);
  }

  /**
   * the current visible component
   */
  private activeComponent?: ComponentModel;

  formatToInstallableVersion(version: string) {
    return snapToSemver(version);
  }

  private copyNpmId = () => {
    const packageName = this.activeComponent?.packageName;
    if (packageName) {
      const version = this.activeComponent?.id.version;
      const versionString = version ? `@${this.formatToInstallableVersion(version)}` : '';
      copy(`${packageName}${versionString}`);
    }
  };

  private commandRunner?: CommandRunner;

  /**
   * set by the command bar, so the menu items can run its commands.
   */
  registerCommandRunner(commandRunner: CommandRunner) {
    this.commandRunner = commandRunner;
  }

  private runCommand(commandId: string) {
    return this.commandRunner?.(commandId);
  }

  /**
   * key bindings used by component aspect
   */
  readonly keyBindings: ComponentCommand[] = [
    {
      id: 'component.copyBitId', // TODO - extract to a component!
      action: () => {
        copy(this.activeComponent?.id.toString() || '');
      },
      displayName: 'Copy component ID',
      keybinding: '.',
    },
    {
      id: 'component.copyNpmId', // TODO - extract to a component!
      action: this.copyNpmId,
      displayName: 'Copy component package name',
      keybinding: ',',
    },
  ];

  private menuItems: MenuItem[] = [
    {
      category: 'general',
      title: 'Open command bar',
      keyChar: 'mod+k',
      handler: () => this.runCommand('command-bar.open'),
    },
    {
      category: 'general',
      title: 'Toggle component list',
      keyChar: 'alt+s',
      handler: () => this.runCommand('sidebar.toggle'),
    },
    {
      category: 'workflow',
      title: 'Copy component ID',
      keyChar: '.',
      handler: () => this.runCommand('component.copyBitId'),
    },
    {
      category: 'workflow',
      title: 'Copy component package name',
      keyChar: ',',
      handler: () => this.runCommand('component.copyNpmId'),
    },
  ];

  private bitMethod: ConsumePlugin = ({
    options,
    id: componentId,
    packageName: packageNameFromProps,
    latest: latestFromProps,
    componentModel,
  }) => {
    const packageName = packageNameFromProps || componentModel?.packageName;
    const latest = latestFromProps || componentModel?.id.version;

    const version = componentId.version === latest ? '' : `@${componentId.version}`;
    const packageVersion =
      componentId.version === latest ? '' : `@${this.formatToInstallableVersion(componentId.version as string)}`;

    return {
      Title: <img style={{ width: '20px' }} src="https://static.bit.dev/brands/bit-logo-text.svg" />,
      Component: !options?.hide ? (
        <Import
          componentId={`${componentId.toString({ ignoreVersion: true })}${version}`}
          packageName={`${packageName}${packageVersion}`}
          componentName={componentId.name}
          showInstallMethod={!options?.disableInstall}
        />
      ) : null,
      order: 0,
    };
  };

  handleComponentChange = (activeComponent?: ComponentModel) => {
    this.activeComponent = activeComponent;
  };

  getComponentUI(host: string, options: GetComponentsOptions = {}) {
    return (
      <Component
        routeSlot={this.routeSlot}
        containerSlot={this.pageItemSlot}
        onComponentChange={this.handleComponentChange}
        host={host}
        path={options.path}
        useComponent={options.useComponent}
        componentIdStr={options.componentId}
        useComponentFilters={options.useComponentFilters}
        overriddenRoutes={options.routes}
      />
    );
  }

  getMenu(host: string, options: GetComponentsOptions = {}) {
    return (
      <ComponentMenu
        className={options.className}
        skipRightSide={options.skipRightSide}
        navigationSlot={this.navSlot}
        consumeMethodSlot={this.consumeMethodSlot}
        rightSideMenuSlot={this.rightSideMenuSlot}
        widgetSlot={this.widgetSlot}
        host={host}
        menuItemSlot={this.menuItemSlot}
        useComponent={options.useComponent}
        path={options.path}
        componentIdStr={options.componentId}
        useComponentFilters={options.useComponentFilters}
        RightNode={options.RightNode}
        authToken={options.authToken}
        pinnedWidgetSlot={this.pinnedWidgetSlot}
      />
    );
  }

  listMenuItems() {
    const mainMenuItems = groupBy(flatten(this.menuItemSlot.values()), 'category');
    return mainMenuItems;
  }

  registerRoute(routes: RouteProps[] | RouteProps) {
    this.routeSlot.register(routes);
    return this;
  }

  registerNavigation(nav: LinkProps, order?: number) {
    this.navSlot.register({
      props: nav,
      order,
    });
  }

  registerConsumeMethod(...consumeMethods: ConsumePlugin[]) {
    this.consumeMethodSlot.register(consumeMethods);
  }

  registerWidget(widget: LinkProps, order?: number) {
    this.widgetSlot.register({ props: widget, order });
  }

  registerPinnedWidget(widget: LinkProps, order?: number) {
    this.pinnedWidgetSlot.register({ props: widget, order });
  }

  registerRightSideMenuItem(...rightSideMenuItem: RightSideMenuItem[]) {
    this.rightSideMenuSlot.register(rightSideMenuItem);
  }

  registerMenuItem = (menuItems: MenuItem[]) => {
    this.menuItemSlot.register(menuItems);
  };

  registerPageItem = (...items: ComponentPageElement[]) => {
    this.pageItemSlot.register(items);
  };

  /** register widgets to the components listed in the command bar */
  registerSearchResultWidget = (...items: ComponentResultPlugin[]) => {
    this.componentSearchResultSlot.register(items);
    const totalPlugins = flatten(this.componentSearchResultSlot.values());

    this.componentSearcher.updatePlugins(totalPlugins);
  };

  updateComponents = (components: ComponentModel[]) => {
    this.componentSearcher.update(components || []);
  };

  static dependencies = [ReactRouterAspect];

  static runtime = UIRuntime;

  static slots = [
    Slot.withType<RouteProps>(),
    Slot.withType<NavPlugin>(),
    Slot.withType<NavigationSlot>(),
    Slot.withType<ConsumeMethodSlot>(),
    Slot.withType<MenuItemSlot>(),
    Slot.withType<ComponentPageSlot>(),
    Slot.withType<ComponentSearchResultSlot>(),
    Slot.withType<RightSideMenuSlot>(),
    Slot.withType<NavPlugin>(),
  ];
  static defaultConfig: ComponentUIConfig = {
    commandBar: true,
  };

  static async provider(
    [reactRouterUI]: [ReactRouterUI],
    config: ComponentUIConfig,
    [
      routeSlot,
      navSlot,
      consumeMethodSlot,
      widgetSlot,
      menuItemSlot,
      pageSlot,
      componentSearchResultSlot,
      rightSideMenuSlot,
      pinnedWidgetSlot,
    ]: [
      RouteSlot,
      OrderedNavigationSlot,
      ConsumeMethodSlot,
      OrderedNavigationSlot,
      MenuItemSlot,
      ComponentPageSlot,
      ComponentSearchResultSlot,
      RightSideMenuSlot,
      OrderedNavigationSlot,
    ]
  ) {
    // TODO: refactor ComponentHost to a separate extension (including sidebar, host, graphql, etc.)
    // TODO: add contextual hook for ComponentHost @uri/@oded
    const componentUI = new ComponentUI(
      routeSlot,
      navSlot,
      consumeMethodSlot,
      widgetSlot,
      pinnedWidgetSlot,
      rightSideMenuSlot,
      menuItemSlot,
      pageSlot,
      componentSearchResultSlot,
      reactRouterUI,
      config.commandBar
    );
    const aspectSection = new AspectSection();
    // @ts-ignore
    componentUI.registerSearchResultWidget({ key: 'deprecation', end: DeprecationIcon });

    componentUI.registerMenuItem(componentUI.menuItems);
    componentUI.registerRoute(aspectSection.route);
    componentUI.registerWidget(aspectSection.navigationLink, aspectSection.order);
    componentUI.registerConsumeMethod(componentUI.bitMethod);
    return componentUI;
  }
}

export default ComponentUI;

ComponentAspect.addRuntime(ComponentUI);
