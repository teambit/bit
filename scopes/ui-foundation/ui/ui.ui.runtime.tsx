import { Slot, SlotRegistry } from '@teambit/harmony';
import type { ReactRouterUI } from '@teambit/react-router';
import { ReactRouterAspect } from '@teambit/react-router';

import React, { ReactNode, ComponentType } from 'react';
import ReactDOM from 'react-dom';
import ReactDOMServer from 'react-dom/server';

import { Compose } from './compose';
import { UIRootFactory } from './ui-root.ui';
import { UIAspect, UIRuntime } from './ui.aspect';
import { ClientContext } from './ui/client-context';
import { Html, MountPoint, Assets } from './ssr/html';
import type { SsrContent } from './ssr/ssr-content';
import type { BrowserData } from './ssr/request-browser';

export type SsrLifecycle<T = any> = {
  /**
   * Initialize a context state for this specific rendering.
   * Context state will only be available to the current Aspect, in the other hooks, as well as a prop to the react context component.
   */
  init?: (browser: BrowserData | undefined) => T | Promise<T> | undefined;
  /**
   * Executes before running ReactDOM.renderToString(). Return value will replace the existing context state.
   */
  onBeforeRender?: (ctx: T, app: ReactNode) => T | Promise<T> | undefined;
  /**
   * Produce html assets, after the body is rendered, and before rendering the complete html.
   * @returns
   * state: will be rendered to the dom as a `<script type="json"/>`.
   * More assets will be available in the future.
   */
  onSerializeAssets?: (ctx: T, app: ReactNode) => { state: string } | Promise<{ state: string }> | undefined;
};

export type ContextComponentType<T = any> = ComponentType<{ renderCtx?: T; children: ReactNode }>;
type RenderingContext = Record<string, any>;

type HudSlot = SlotRegistry<ReactNode>;
type ContextSlot = SlotRegistry<ContextComponentType>;
type SsrLifecycleSlot = SlotRegistry<SsrLifecycle>;
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
    /** slot for context provider elements */
    private contextSlot: ContextSlot,
    /** hooks into the ssr render process */
    private ssrLifecycleSlot: SsrLifecycleSlot
  ) {}

  async render(rootExtension: string) {
    const rootFactory = this.getRoot(rootExtension);
    if (!rootFactory) throw new Error(`root: ${rootExtension} was not found`);
    const uiRoot = rootFactory();
    const routes = this.router.renderRoutes(uiRoot.routes, { initialLocation: window.location.href });
    const hudItems = this.hudSlot.values();
    const contexts = this.contextSlot.values();

    // .render() should already run .hydrate() if possible.
    // in the future, we may want to replace it with .hydrate()
    ReactDOM.render(
      <Compose components={contexts}>
        <ClientContext>
          {hudItems}
          {routes}
        </ClientContext>
      </Compose>,
      document.getElementById('root')
    );
  }

  async renderSsr(rootExtension: string, { assets, browser }: SsrContent = {}) {
    const rootFactory = this.getRoot(rootExtension);
    if (!rootFactory) throw new Error(`root: ${rootExtension} was not found`);

    const uiRoot = rootFactory();
    const routes = this.router.renderRoutes(uiRoot.routes, { initialLocation: browser?.location.url });
    const hudItems = this.hudSlot.values();
    const contexts = this.contextSlot.values();

    // (1) init
    let renderCtx = await this.initSsrContext(browser);

    const contextProps = this.contextSlot
      .toArray()
      .map(([key]) => renderCtx[key])
      .map((ctx) => ({ renderCtx: ctx }));

    // (2) make (virtual) dom
    const app = (
      <MountPoint>
        <Compose components={contexts} forwardProps={contextProps}>
          <ClientContext>
            {hudItems}
            {routes}
          </ClientContext>
        </Compose>
      </MountPoint>
    );

    // (3) render
    renderCtx = await this.onBeforeRender(renderCtx, app);
    const renderedApp = ReactDOMServer.renderToString(app);

    // (3) render html-template
    const realtimeAssets = await this.onSerializeAssets(renderCtx, app);
    const html = <Html title="bit dev ssred!" assets={{ ...assets, ...realtimeAssets }} />;
    const renderedHtml = `<!DOCTYPE html>${ReactDOMServer.renderToStaticMarkup(html)}`;
    const fullHtml = Html.fillContent(renderedHtml, renderedApp);

    // (4) serve
    return fullHtml;
  }

  /** adds elements to the Heads Up Display */
  registerHudItem = (element: ReactNode) => {
    this.hudSlot.register(element);
  };

  // ** adds global context at the ui root */
  registerContext<T>(context: ContextComponentType<T>) {
    this.contextSlot.register(context);
  }

  registerRoot(uiRoot: UIRootFactory) {
    return this.uiRootSlot.register(uiRoot);
  }

  registerRenderHooks(hooks: SsrLifecycle) {
    return this.ssrLifecycleSlot.register(hooks);
  }

  private async initSsrContext(browserData: BrowserData | undefined) {
    const ctx = {};

    const promises = this.ssrLifecycleSlot.toArray().map(async ([key, hooks]) => {
      if (!hooks.init) return;

      const result = await hooks.init(browserData);
      if (result) ctx[key] = result;
    });

    await Promise.all(promises);

    return ctx;
  }

  private async onBeforeRender(ctx: RenderingContext, app: ReactNode) {
    const update: RenderingContext = {};

    const promises = this.ssrLifecycleSlot.toArray().map(async ([key, hooks]) => {
      if (!hooks.onBeforeRender) return;

      const result = await hooks.onBeforeRender(ctx[key], app);
      if (result) update[key] = result;
    });

    await Promise.all(promises);

    return {
      ...ctx,
      ...update,
    };
  }

  private async onSerializeAssets(ctx: RenderingContext, app: ReactNode) {
    const state = {};

    const promises = this.ssrLifecycleSlot.toArray().map(async ([key, hooks]) => {
      if (!hooks.onSerializeAssets) return;

      const result = await hooks.onSerializeAssets(ctx[key], app);

      if (result?.state) state[key] = result.state;
    });

    await Promise.all(promises);

    // more assets will be added in the future
    const assets: Assets = { state };
    return assets;
  }

  private getRoot(rootExtension: string) {
    return this.uiRootSlot.get(rootExtension);
  }

  static slots = [
    Slot.withType<UIRootFactory>(),
    Slot.withType<ReactNode>(),
    Slot.withType<ContextComponentType>(),
    Slot.withType<SsrLifecycle>(),
  ];

  static dependencies = [ReactRouterAspect];

  static runtime = UIRuntime;

  static async provider(
    [router]: [ReactRouterUI],
    config,
    [uiRootSlot, hudSlot, contextSlot, ssrLifecycleSlot]: [UIRootRegistry, HudSlot, ContextSlot, SsrLifecycleSlot]
  ) {
    return new UiUI(router, uiRootSlot, hudSlot, contextSlot, ssrLifecycleSlot);
  }
}

UIAspect.addRuntime(UiUI);
