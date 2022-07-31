import type { GraphqlUI } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import type { ReactRouterUI } from '@teambit/react-router';
import { ReactRouterAspect } from '@teambit/react-router';
import { ServerRenderer, BrowserRenderer } from '@teambit/react.rendering.ssr';
import type { SsrSession, RenderPlugin, ContextProps } from '@teambit/react.rendering.ssr';

import React, { ReactNode, ComponentType } from 'react';

import { UIRootFactory } from './ui-root.ui';
import { UIAspect, UIRuntime } from './ui.aspect';
import { ClientContext } from './ui/client-context';

type HudSlot = SlotRegistry<ReactNode>;
type RenderPluginsSlot = SlotRegistry<RenderPlugin<any, any>>;
type UIRootRegistry = SlotRegistry<UIRootFactory>;

/**
 * extension
 */
export class UiUI {
  constructor(
    /**
     * react-router extension.
     */
    private router: ReactRouterUI,
    /**
     * ui root registry.
     */
    private uiRootSlot: UIRootRegistry,
    /** slot for overlay ui elements */
    private hudSlot: HudSlot,
    /** hooks into the ssr render process */
    private renderPluginsSlot: RenderPluginsSlot
  ) {}

  /** render and rehydrate client-side */
  async render(rootExtension: string): Promise<void> {
    const rootFactory = this.getRoot(rootExtension);
    if (!rootFactory) throw new Error(`root: ${rootExtension} was not found`);
    const uiRoot = rootFactory();
    const routes = this.router.renderRoutes(uiRoot.routes);
    const hudItems = this.hudSlot.values();
    const lifecyclePlugins = this.getLifecyclePlugins();

    const reactSsr = new BrowserRenderer(lifecyclePlugins);
    await reactSsr.render(
      <ClientContext>
        {hudItems}
        {routes}
      </ClientContext>
    );
  }

  /** render dehydrated server-side */
  async renderSsr(rootExtension: string, ssrContent: SsrSession): Promise<string> {
    const rootFactory = this.getRoot(rootExtension);
    if (!rootFactory) throw new Error(`root: ${rootExtension} was not found`);

    const uiRoot = rootFactory();
    const routes = this.router.renderRoutes(uiRoot.routes);
    const hudItems = this.hudSlot.values();
    const lifecyclePlugins = this.getLifecyclePlugins();

    const reactSsr = new ServerRenderer(lifecyclePlugins);
    const fullHtml = await reactSsr.render(
      <ClientContext>
        {hudItems}
        {routes}
      </ClientContext>,
      ssrContent
    );

    return fullHtml;
  }

  /** adds elements to the Heads Up Display */
  registerHudItem = (element: ReactNode) => {
    this.hudSlot.register(element);
  };

  /**
   * adds global context at the ui root
   * @deprecated replace with `.registerRenderHooks({ reactContext })`.
   */
  registerContext<T>(context: ComponentType<ContextProps<T>>) {
    this.renderPluginsSlot.register({ reactContext: context });
  }

  registerRoot(uiRoot: UIRootFactory) {
    return this.uiRootSlot.register(uiRoot);
  }

  registerRenderHooks<T, Y>(plugin: RenderPlugin<T, Y>) {
    return this.renderPluginsSlot.register(plugin);
  }

  private getLifecyclePlugins() {
    const lifecyclePlugins = this.renderPluginsSlot.toArray().map(([key, plugin]) => {
      if (plugin.key) return plugin;

      // for backward compatibility
      return { ...plugin, key };
    });

    // react-router should register its plugin, when we can reverse it's dependency to depend on Ui
    lifecyclePlugins.unshift(this.router.renderPlugin);

    return lifecyclePlugins;
  }

  private getRoot(rootExtension: string) {
    return this.uiRootSlot.get(rootExtension);
  }

  static slots = [Slot.withType<UIRootFactory>(), Slot.withType<ReactNode>(), Slot.withType<RenderPlugin>()];

  static dependencies = [GraphqlAspect, ReactRouterAspect];

  static runtime = UIRuntime;

  static async provider(
    [GraphqlUi, router]: [GraphqlUI, ReactRouterUI],
    config,
    [uiRootSlot, hudSlot, renderLifecycleSlot]: [UIRootRegistry, HudSlot, RenderPluginsSlot]
  ) {
    const uiUi = new UiUI(router, uiRootSlot, hudSlot, renderLifecycleSlot);

    if (GraphqlUi) uiUi.registerRenderHooks(GraphqlUi.renderPlugins);

    return uiUi;
  }
}

UIAspect.addRuntime(UiUI);
