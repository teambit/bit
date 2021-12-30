import type { GraphqlUI } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import type { ReactRouterUI } from '@teambit/react-router';
import { ReactRouterAspect } from '@teambit/react-router';

import React, { ReactNode, ComponentType } from 'react';

import { UIRootFactory } from './ui-root.ui';
import { UIAspect, UIRuntime } from './ui.aspect';
import { ClientContext } from './ui/client-context';
import type { SsrContent } from './ssr/ssr-content';
import { RenderLifecycle } from './render-lifecycle';
import { ReactSSR } from './react-ssr';

export type ContextProps<T = any> = { renderCtx?: T; children: ReactNode };

type HudSlot = SlotRegistry<ReactNode>;
type renderLifecycleSlot = SlotRegistry<RenderLifecycle>;
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
    private lifecycleSlot: renderLifecycleSlot
  ) {}

  /** render and rehydrate client-side */
  async render(rootExtension: string): Promise<void> {
    const rootFactory = this.getRoot(rootExtension);
    if (!rootFactory) throw new Error(`root: ${rootExtension} was not found`);
    const uiRoot = rootFactory();
    const initialLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const routes = this.router.renderRoutes(uiRoot.routes, { initialLocation });
    const hudItems = this.hudSlot.values();
    const lifecycleHooks = this.lifecycleSlot.toArray();

    const reactSsr = new ReactSSR(lifecycleHooks);
    await reactSsr.renderBrowser(
      <ClientContext>
        {hudItems}
        {routes}
      </ClientContext>
    );
  }

  /** render dehydrated server-side */
  async renderSsr(rootExtension: string, ssrContent: SsrContent): Promise<string> {
    const rootFactory = this.getRoot(rootExtension);
    if (!rootFactory) throw new Error(`root: ${rootExtension} was not found`);

    const uiRoot = rootFactory();
    const routes = this.router.renderRoutes(uiRoot.routes, { initialLocation: ssrContent?.browser?.location.url });
    const hudItems = this.hudSlot.values();

    const lifecycleHooks = this.lifecycleSlot.toArray();

    const reactSsr = new ReactSSR(lifecycleHooks);
    const fullHtml = await reactSsr.renderServer(
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
    this.lifecycleSlot.register({
      reactContext: context,
    });
  }

  registerRoot(uiRoot: UIRootFactory) {
    return this.uiRootSlot.register(uiRoot);
  }

  registerRenderHooks<T, Y>(hooks: RenderLifecycle<T, Y>) {
    return this.lifecycleSlot.register(hooks);
  }

  private getRoot(rootExtension: string) {
    return this.uiRootSlot.get(rootExtension);
  }

  static slots = [Slot.withType<UIRootFactory>(), Slot.withType<ReactNode>(), Slot.withType<RenderLifecycle>()];

  static dependencies = [GraphqlAspect, ReactRouterAspect];

  static runtime = UIRuntime;

  static async provider(
    [GraphqlUi, router]: [GraphqlUI, ReactRouterUI],
    config,
    [uiRootSlot, hudSlot, renderLifecycleSlot]: [UIRootRegistry, HudSlot, renderLifecycleSlot]
  ) {
    const uiUi = new UiUI(router, uiRootSlot, hudSlot, renderLifecycleSlot);

    uiUi.registerRenderHooks(GraphqlUi.renderHooks);

    return uiUi;
  }
}

UIAspect.addRuntime(UiUI);
