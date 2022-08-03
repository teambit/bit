import React from 'react';
import flatten from 'lodash.flatten';
import copy from 'copy-to-clipboard';
import type { RouteProps } from 'react-router-dom';

import type { LinkProps } from '@teambit/base-react.navigation.link';
import CommandBarAspect, { CommandBarUI, CommandEntry } from '@teambit/command-bar';
import { DeprecationIcon } from '@teambit/component.ui.deprecation-icon';
import { Slot, SlotRegistry } from '@teambit/harmony';
import PreviewAspect, { ClickInsideAnIframeEvent } from '@teambit/preview';
import PubsubAspect, { BitBaseEvent, PubsubUI } from '@teambit/pubsub';
import ReactRouterAspect, { ReactRouterUI } from '@teambit/react-router';
import { UIRuntime } from '@teambit/ui';
import { isBrowser } from '@teambit/ui-foundation.ui.is-browser';
import { MenuItem, MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import { NavigationSlot, RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { Import } from '@teambit/ui-foundation.ui.use-box.menu';

import { AspectSection } from './aspect.section';
import { ComponentAspect } from './component.aspect';
import { ComponentModel } from './ui';
import { Component, ComponentPageElement, ComponentPageSlot } from './ui/component';
import { ComponentResultPlugin, ComponentSearcher } from './ui/component-searcher';
import { ConsumeMethodSlot, ConsumePlugin, ComponentMenu, NavPlugin, OrderedNavigationSlot } from './ui/menu';
import { GetComponentsOptions } from './get-component-opts';

export type ComponentSearchResultSlot = SlotRegistry<ComponentResultPlugin[]>;

export type ComponentUIConfig = {
  commandBar: boolean
};

export type Server = {
  env: string;
  url: string;
};

export type ComponentMeta = {
  id: string;
};

export class ComponentUI {
  readonly routePath = `/*`;
  private componentSearcher: ComponentSearcher;

  constructor(
    /**
     * Pubsub aspects
     */
    private pubsub: PubsubUI,

    private routeSlot: RouteSlot,

    private navSlot: OrderedNavigationSlot,

    private consumeMethodSlot: ConsumeMethodSlot,

    /**
     * slot for registering a new widget to the menu.
     */
    private widgetSlot: OrderedNavigationSlot,

    private menuItemSlot: MenuItemSlot,

    private pageItemSlot: ComponentPageSlot,

    private componentSearchResultSlot: ComponentSearchResultSlot,

    private commandBarUI: CommandBarUI,

    reactRouterUi: ReactRouterUI
  ) {
    this.componentSearcher = new ComponentSearcher({ navigate: reactRouterUi.navigateTo });
    if (isBrowser) this.registerPubSub();
  }

  /**
   * the current visible component
   */
  private activeComponent?: ComponentModel;

  private copyNpmId = () => {
    const packageName = this.activeComponent?.packageName;
    if (packageName) {
      const version = this.activeComponent?.id.version;
      const versionString = version ? `@${version}` : '';
      copy(`${packageName}${versionString}`);
    }
  };

  /**
   * key bindings used by component aspect
   */
  private keyBindings: CommandEntry[] = [
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
      handler: () => this.commandBarUI?.run('command-bar.open'),
    },
    {
      category: 'general',
      title: 'Toggle component list',
      keyChar: 'alt+s',
      handler: () => this.commandBarUI?.run('sidebar.toggle'),
    },
    {
      category: 'workflow',
      title: 'Copy component ID',
      keyChar: '.',
      handler: () => this.commandBarUI?.run('component.copyBitId'),
    },
    {
      category: 'workflow',
      title: 'Copy component package name',
      keyChar: ',',
      handler: () => this.commandBarUI?.run('component.copyNpmId'),
    },
  ];

  private bitMethod: ConsumePlugin = (comp, options) => {
    const version = comp.version === comp.latest ? '' : `@${comp.version}`;
    return {
      Title: <img style={{ width: '20px' }} src="https://static.bit.dev/brands/bit-logo-text.svg" />,
      Component: (
        <Import
          componentId={`${comp.id.toString({ ignoreVersion: true })}${version}`}
          packageName={`${comp.packageName}${version}`}
          componentName={comp.id.name}
          showInstallMethod={!options?.currentLane}
        />
      ),
      order: 0,
    };
  };

  registerPubSub() {
    this.pubsub.sub(PreviewAspect.id, (be: BitBaseEvent<any>) => {
      if (be.type === ClickInsideAnIframeEvent.TYPE) {
        const event = new MouseEvent('mousedown', {
          view: window,
          bubbles: true,
          cancelable: true,
        });

        const body = document.body;
        body?.dispatchEvent(event);
      }
    });
  }

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
        useComponent={options.useComponent}
        componentIdStr={options.componentId}
      />
    );
  }

  getMenu(host: string, opts: GetComponentsOptions = {}) {
    return (
      <ComponentMenu
        navigationSlot={this.navSlot}
        consumeMethodSlot={this.consumeMethodSlot}
        widgetSlot={this.widgetSlot}
        host={host}
        menuItemSlot={this.menuItemSlot}
        useComponent={opts.useComponent}
        componentIdStr={opts.componentId}
      />
    );
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

  static dependencies = [PubsubAspect, CommandBarAspect, ReactRouterAspect];

  static runtime = UIRuntime;

  static slots = [
    Slot.withType<RouteProps>(),
    Slot.withType<NavPlugin>(),
    Slot.withType<NavigationSlot>(),
    Slot.withType<ConsumeMethodSlot>(),
    Slot.withType<MenuItemSlot>(),
    Slot.withType<ComponentPageSlot>(),
    Slot.withType<ComponentSearchResultSlot>(),
  ];
  static defaultConfig: ComponentUIConfig = {
    commandBar: true
  }

  static async provider(
    [pubsub, commandBarUI, reactRouterUI]: [PubsubUI, CommandBarUI, ReactRouterUI],
    config: ComponentUIConfig,
    [routeSlot, navSlot, consumeMethodSlot, widgetSlot, menuItemSlot, pageSlot, componentSearchResultSlot]: [
      RouteSlot,
      OrderedNavigationSlot,
      ConsumeMethodSlot,
      OrderedNavigationSlot,
      MenuItemSlot,
      ComponentPageSlot,
      ComponentSearchResultSlot
    ]
  ) {
    // TODO: refactor ComponentHost to a separate extension (including sidebar, host, graphql, etc.)
    // TODO: add contextual hook for ComponentHost @uri/@oded
    const componentUI = new ComponentUI(
      pubsub,
      routeSlot,
      navSlot,
      consumeMethodSlot,
      widgetSlot,
      menuItemSlot,
      pageSlot,
      componentSearchResultSlot,
      commandBarUI,
      reactRouterUI
    );
    const aspectSection = new AspectSection();
    // @ts-ignore
    componentUI.registerSearchResultWidget({ key: 'deprecation', end: DeprecationIcon });

    if (componentUI.commandBarUI && config.commandBar) {
      componentUI.commandBarUI.addCommand(...componentUI.keyBindings);
      commandBarUI.addSearcher(componentUI.componentSearcher);
    }

    componentUI.registerMenuItem(componentUI.menuItems);
    componentUI.registerRoute(aspectSection.route);
    componentUI.registerWidget(aspectSection.navigationLink, aspectSection.order);
    componentUI.registerConsumeMethod(componentUI.bitMethod);
    return componentUI;
  }
}

export default ComponentUI;

ComponentAspect.addRuntime(ComponentUI);
