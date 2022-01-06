import type { GraphqlUI } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import type { ReactRouterUI } from '@teambit/react-router';
import { ReactRouterAspect } from '@teambit/react-router';
import { Html, MountPoint, mountPointId, ssrCleanup, Assets } from '@teambit/ui-foundation.ui.rendering.html';

import { merge } from 'webpack-merge';
import React, { ReactNode, ComponentType } from 'react';
import ReactDOM from 'react-dom';
import ReactDOMServer from 'react-dom/server';
import compact from 'lodash.compact';

import { Compose, Wrapper } from './compose';
import { UIRootFactory } from './ui-root.ui';
import { UIAspect, UIRuntime } from './ui.aspect';
import { ClientContext } from './ui/client-context';
import type { SsrContent } from './ssr/ssr-content';
import type { RequestServer } from './ssr/request-server';
import type { BrowserData } from './ssr/request-browser';
import { RenderLifecycle } from './render-lifecycle';
import { UIConfig } from './ui-config';

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

    // TODO - extract the logic from here down as reusable ssr machine
    const deserializedState = await this.deserialize(lifecycleHooks);
    let renderContexts = await this.triggerBrowserInit(lifecycleHooks, deserializedState);
    const reactContexts = this.getReactContexts(lifecycleHooks, renderContexts);

    const app = (
      <Compose components={reactContexts}>
        <ClientContext>
          {hudItems}
          {routes}
        </ClientContext>
      </Compose>
    );

    renderContexts = await this.triggerBeforeHydrateHook(renderContexts, lifecycleHooks, app);

    const mountPoint = document.getElementById(mountPointId);
    // .render() already runs `.hydrate()` behind the scenes.
    // in the future, we may want to replace it with .hydrate()
    ReactDOM.render(app, mountPoint);

    await this.triggerHydrateHook(renderContexts, lifecycleHooks, mountPoint);

    // remove ssr only styles
    ssrCleanup();
  }

  /** render dehydrated server-side */
  async renderSsr(rootExtension: string, { assets, browser, server }: SsrContent = {}): Promise<string> {
    const rootFactory = this.getRoot(rootExtension);
    if (!rootFactory) throw new Error(`root: ${rootExtension} was not found`);

    const uiRoot = rootFactory();
    const routes = this.router.renderRoutes(uiRoot.routes, { initialLocation: browser?.location.url });
    const hudItems = this.hudSlot.values();

    // create array once to keep consistent indexes
    const lifecycleHooks = this.lifecycleSlot.toArray();

    // TODO - extract the logic from here down as reusable ssr machine
    // (1) init
    let renderContexts = await this.triggerServerInit(lifecycleHooks, browser, server);
    const reactContexts = this.getReactContexts(lifecycleHooks, renderContexts);

    // (2) make (virtual) dom
    const app = (
      <MountPoint>
        <Compose components={reactContexts}>
          <ClientContext>
            {hudItems}
            {routes}
          </ClientContext>
        </Compose>
      </MountPoint>
    );

    // (3) render
    renderContexts = await this.onBeforeRender(renderContexts, lifecycleHooks, app);

    const renderedApp = ReactDOMServer.renderToString(app);

    // (3) render html-template
    const realtimeAssets = await this.serialize(lifecycleHooks, renderContexts, app);
    // @ts-ignore // TODO upgrade 'webpack-merge'
    const totalAssets = merge(assets, realtimeAssets) as Assets;

    const html = <Html assets={totalAssets} withDevTools fullHeight ssr />;
    const renderedHtml = `<!DOCTYPE html>${ReactDOMServer.renderToStaticMarkup(html)}`;
    const fullHtml = Html.fillContent(renderedHtml, renderedApp);

    // (4) serve
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

  private triggerBrowserInit(lifecycleHooks: [string, RenderLifecycle<any, any>][], deserializedState: any[]) {
    return Promise.all(lifecycleHooks.map(([, hooks], idx) => hooks.browserInit?.(deserializedState[idx])));
  }

  private triggerServerInit(
    lifecycleHooks: [string, RenderLifecycle<any, any>][],
    browser?: BrowserData,
    server?: RequestServer
  ) {
    return Promise.all(lifecycleHooks.map(([, hooks]) => hooks.serverInit?.({ browser, server })));
  }

  private getReactContexts(lifecycleHooks: [string, RenderLifecycle<any>][], renderContexts: any[]): Wrapper[] {
    return compact(
      lifecycleHooks.map(([, hooks], idx) => {
        const renderCtx = renderContexts[idx];
        const props = { renderCtx };
        return hooks.reactContext ? [hooks.reactContext, props] : undefined;
      })
    );
  }

  private async onBeforeRender(
    renderContexts: any[],
    lifecycleHooks: [string, RenderLifecycle<any>][],
    app: JSX.Element
  ) {
    await Promise.all(
      lifecycleHooks.map(async ([, hooks], idx) => {
        const ctx = renderContexts[idx];
        const nextCtx = await hooks.onBeforeRender?.(ctx, app);
        return nextCtx || ctx;
      })
    );
    return renderContexts;
  }

  private triggerBeforeHydrateHook(
    renderContexts: any[],
    lifecycleHooks: [string, RenderLifecycle<any>][],
    app: JSX.Element
  ) {
    return Promise.all(
      lifecycleHooks.map(async ([, hooks], idx) => {
        const ctx = renderContexts[idx];
        const nextCtx = await hooks.onBeforeHydrate?.(ctx, app);
        return nextCtx || ctx;
      })
    );
  }

  private async triggerHydrateHook(
    renderContexts: any[],
    lifecycleHooks: [string, RenderLifecycle<any, any>][],
    mountPoint: HTMLElement | null
  ) {
    await Promise.all(lifecycleHooks.map(([, hooks], idx) => hooks.onHydrate?.(renderContexts[idx], mountPoint)));
  }

  private async serialize(
    lifecycleHooks: [string, RenderLifecycle][],
    renderContexts: any[],
    app: ReactNode
  ): Promise<Assets> {
    const json = {};

    await Promise.all(
      lifecycleHooks.map(async ([key, hooks], idx) => {
        const renderCtx = renderContexts[idx];
        const result = await hooks.serialize?.(renderCtx, app);

        if (!result) return;
        if (result.json) json[key] = result.json;
      })
    );

    // more assets will be available in the future
    return { json };
  }

  private async deserialize(lifecycleHooks: [string, RenderLifecycle][]) {
    const rawAssets = Html.popAssets();

    const deserialized = await Promise.all(
      lifecycleHooks.map(async ([key, hooks]) => {
        try {
          const raw = rawAssets.get(key);
          return hooks.deserialize?.(raw);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`failed deserializing server state for aspect ${key}`, e);
          return undefined;
        }
      })
    );

    return deserialized;
  }

  private getRoot(rootExtension: string) {
    return this.uiRootSlot.get(rootExtension);
  }

  static slots = [Slot.withType<UIRootFactory>(), Slot.withType<ReactNode>(), Slot.withType<RenderLifecycle>()];

  static dependencies = [GraphqlAspect, ReactRouterAspect];

  static runtime = UIRuntime;

  static async provider(
    [graphqlUi, router]: [GraphqlUI, ReactRouterUI],
    config: UIConfig,
    [uiRootSlot, hudSlot, renderLifecycleSlot]: [UIRootRegistry, HudSlot, renderLifecycleSlot]
  ) {
    if (config.urlBasename) {
      graphqlUi.setBasename(config.urlBasename);
      router.setBasename(config.urlBasename);
    }

    const uiUi = new UiUI(router, uiRootSlot, hudSlot, renderLifecycleSlot);

    uiUi.registerRenderHooks(graphqlUi.renderHooks);

    return uiUi;
  }
}

UIAspect.addRuntime(UiUI);
