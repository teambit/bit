import type { GraphqlUI } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import type { ReactRouterUI } from '@teambit/react-router';
import { ReactRouterAspect } from '@teambit/react-router';

import merge from 'webpack-merge';
import React, { ReactNode, ComponentType } from 'react';
import ReactDOM from 'react-dom';
import ReactDOMServer from 'react-dom/server';
import compact from 'lodash.compact';

import { Compose, Wrapper } from './compose';
import { UIRootFactory } from './ui-root.ui';
import { UIAspect, UIRuntime } from './ui.aspect';
import { ClientContext } from './ui/client-context';
import { Html, MountPoint, Assets } from './ssr/html';
import type { SsrContent } from './ssr/ssr-content';
import type { BrowserData } from './ssr/request-browser';

export type RenderLifecycle<T = any, Y = any> = {
  /**
   * Initialize a context state for this specific rendering.
   * Context state will only be available to the current Aspect, in the other hooks, as well as a prop to the react context component.
   */
  serverInit?: (browser: BrowserData | undefined) => T | void | undefined | Promise<T | void | undefined>;
  /**
   * Executes before running ReactDOM.renderToString(). Return value will replace the existing context state.
   */
  onBeforeRender?: (ctx: T, app: ReactNode) => T | void | undefined | Promise<T | void | undefined>;
  /**
   * Produce html assets. Runs after the body is rendered, and before rendering the final html.
   * @returns
   * json: will be rendered to the dom as a `<script type="json"/>`.
   * More assets will be available in the future.
   */
  serialize?: (ctx: T, app: ReactNode) => { json: string } | Promise<{ json: string }> | undefined;
  /**
   * Converts serialized data from raw string back to structured data.
   * @example deserialize: (data) => { const parsed = JSON.parse(data); return { analytics: new AnalyticsService(parsed); } }
   */
  deserialize?: (data?: string) => Y;
  /**
   * Initialize the context state for client side rendering.
   * Context state will only be available to the current Aspect, in the other hooks, as well as a prop to the react context component.
   */
  browserInit?: (deserializedData: Y) => T | void | undefined | Promise<T | void | undefined>;
  /**
   * Executes before running ReactDOM.hydrate() (or .render() in case server side rendering is skipped). Receives the context produced by `deserialize()`
   */
  onBeforeHydrate?: (context: T, app: ReactNode) => T | void | undefined | Promise<T | void | undefined>;
  /**
   * Executes after browser rendering is complete. Receives context from the previous steps.
   * @example onHydrate: (ref, { analytics }) => { analytics.reportPageView() }
   */
  onHydrate?: (context: T, ref: HTMLElement | null) => void;

  /**
   * Wraps dom with a context. Will receive render context, produced by `onBeforeRender()` (at server-side) or `deserialize()` (at the browser)
   */
  reactContext?: ComponentType<ContextProps<T>>;
};

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

  async render(rootExtension: string) {
    const rootFactory = this.getRoot(rootExtension);
    if (!rootFactory) throw new Error(`root: ${rootExtension} was not found`);
    const uiRoot = rootFactory();
    const routes = this.router.renderRoutes(uiRoot.routes, { initialLocation: window.location.href });
    const hudItems = this.hudSlot.values();

    const lifecycleHooks = this.lifecycleSlot.toArray();
    const deserializedState = await this.deserialize(lifecycleHooks);
    let renderContexts = await Promise.all(
      lifecycleHooks.map(([, hooks], idx) => hooks.browserInit?.(deserializedState[idx]))
    );
    const reactContexts = this.getReactContexts(lifecycleHooks, renderContexts);

    const app = (
      <Compose components={reactContexts}>
        <ClientContext>
          {hudItems}
          {routes}
        </ClientContext>
      </Compose>
    );

    renderContexts = await this.onAfterHydrate(renderContexts, lifecycleHooks, app);

    const mountPoint = document.getElementById('root');
    // .render() should already run .hydrate() if possible.
    // in the future, we may want to replace it with .hydrate()
    ReactDOM.render(app, mountPoint);

    await Promise.all(lifecycleHooks.map(([, hooks], idx) => hooks.onHydrate?.(renderContexts[idx], mountPoint)));

    // remove ssr only styles
    document.getElementById('before-hydrate-styles')?.remove();
  }

  async renderSsr(rootExtension: string, { assets, browser }: SsrContent = {}) {
    const rootFactory = this.getRoot(rootExtension);
    if (!rootFactory) throw new Error(`root: ${rootExtension} was not found`);

    const uiRoot = rootFactory();
    const routes = this.router.renderRoutes(uiRoot.routes, { initialLocation: browser?.location.url });
    const hudItems = this.hudSlot.values();

    // create array once to keep consistent indexes
    const lifecycleHooks = this.lifecycleSlot.toArray();

    // (1) init
    let renderContexts = await Promise.all(lifecycleHooks.map(([, hooks]) => hooks.serverInit?.(browser)));
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

    const html = <Html assets={totalAssets} />;
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

  registerRenderHooks(hooks: RenderLifecycle) {
    return this.lifecycleSlot.register(hooks);
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

  private onAfterHydrate(renderContexts: any[], lifecycleHooks: [string, RenderLifecycle<any>][], app: JSX.Element) {
    return Promise.all(
      lifecycleHooks.map(async ([, hooks], idx) => {
        const ctx = renderContexts[idx];
        const nextCtx = await hooks.onBeforeHydrate?.(ctx, app);
        return nextCtx || ctx;
      })
    );
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
    const raws: Record<string, Element> = {};

    const inDom = Array.from(document.querySelectorAll('body > .state > *'));
    inDom.forEach((elem) => {
      const aspectName = elem.getAttribute('data-aspect');
      if (!aspectName) return;

      raws[aspectName] = elem;
    });

    const deserialized = await Promise.all(
      lifecycleHooks.map(async ([key, hooks]) => {
        const raw = raws[key];
        try {
          return hooks.deserialize?.(raw.innerHTML);
        } catch (e) {
          console.log(`failed deserializing server state for aspect ${key}`);
          return undefined;
        }
      })
    );

    document.querySelector('body > .state')?.remove();

    return deserialized;
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
