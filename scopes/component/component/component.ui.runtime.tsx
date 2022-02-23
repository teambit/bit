import PubsubAspect, { PubsubUI, BitBaseEvent } from '@teambit/pubsub';
import PreviewAspect, { ClickInsideAnIframeEvent } from '@teambit/preview';
import { MenuItemSlot, MenuItem } from '@teambit/ui-foundation.ui.main-dropdown';
import { Slot } from '@teambit/harmony';
import { NavigationSlot, RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import { UIRuntime } from '@teambit/ui';
import { isBrowser } from '@teambit/ui-foundation.ui.is-browser';
import React from 'react';
import { Import } from '@teambit/ui-foundation.ui.use-box.menu';
import { RouteProps } from 'react-router-dom';
import CommandBarAspect, { CommandBarUI, CommandEntry } from '@teambit/command-bar';
import copy from 'copy-to-clipboard';
import { ComponentAspect } from './component.aspect';
import { Component, ComponentPageElement, ComponentPageSlot } from './ui/component';
import { Menu, NavPlugin, OrderedNavigationSlot, ConsumeMethodSlot, ConsumePlugin } from './ui/menu';
import { AspectSection } from './aspect.section';
import { ComponentModel } from './ui';

export type Server = {
  env: string;
  url: string;
};

export type ComponentMeta = {
  id: string;
};

export const componentIdUrlRegex = '[\\w\\/-]*[\\w-]';

export class ComponentUI {
  readonly routePath = `/:componentId(${componentIdUrlRegex})`;

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

    private commandBarUI: CommandBarUI
  ) {
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
      handler: () => {
        copy(this.activeComponent?.id.toString() || '');
      },
      displayName: 'Copy component ID',
      keybinding: '.',
    },
    {
      id: 'component.copyNpmId', // TODO - extract to a component!
      handler: this.copyNpmId,
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

  getComponentUI(host: string) {
    return (
      <Component
        routeSlot={this.routeSlot}
        containerSlot={this.pageItemSlot}
        onComponentChange={this.handleComponentChange}
        host={host}
      />
    );
  }

  getMenu(host: string) {
    return (
      <Menu
        navigationSlot={this.navSlot}
        consumeMethodSlot={this.consumeMethodSlot}
        widgetSlot={this.widgetSlot}
        host={host}
        menuItemSlot={this.menuItemSlot}
      />
    );
  }

  registerRoute(route: RouteProps) {
    this.routeSlot.register(route);
    return this;
  }

  registerNavigation(nav: NavLinkProps, order?: number) {
    this.navSlot.register({
      props: nav,
      order,
    });
  }

  registerConsumeMethod(...consumeMethods: ConsumePlugin[]) {
    this.consumeMethodSlot.register(consumeMethods);
  }

  registerWidget(widget: NavLinkProps, order?: number) {
    this.widgetSlot.register({ props: widget, order });
  }

  registerMenuItem = (menuItems: MenuItem[]) => {
    this.menuItemSlot.register(menuItems);
  };

  registerPageItem = (...items: ComponentPageElement[]) => {
    this.pageItemSlot.register(items);
  };

  static dependencies = [PubsubAspect, CommandBarAspect];

  static runtime = UIRuntime;

  static slots = [
    Slot.withType<RouteProps>(),
    Slot.withType<NavPlugin>(),
    Slot.withType<NavigationSlot>(),
    Slot.withType<ConsumeMethodSlot>(),
    Slot.withType<MenuItemSlot>(),
    Slot.withType<ComponentPageSlot>(),
  ];

  static async provider(
    [pubsub, commandBarUI]: [PubsubUI, CommandBarUI],
    config,
    [routeSlot, navSlot, consumeMethodSlot, widgetSlot, menuItemSlot, pageSlot]: [
      RouteSlot,
      OrderedNavigationSlot,
      ConsumeMethodSlot,
      OrderedNavigationSlot,
      MenuItemSlot,
      ComponentPageSlot
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
      commandBarUI
    );
    const section = new AspectSection();

    componentUI.commandBarUI.addCommand(...componentUI.keyBindings);
    componentUI.registerMenuItem(componentUI.menuItems);
    componentUI.registerRoute(section.route);
    componentUI.registerWidget(section.navigationLink, section.order);
    componentUI.registerConsumeMethod(componentUI.bitMethod);
    return componentUI;
  }
}

export default ComponentUI;

ComponentAspect.addRuntime(ComponentUI);
