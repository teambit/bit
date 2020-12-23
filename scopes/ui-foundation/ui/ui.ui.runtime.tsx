import type { GraphqlUI } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import type { ReactRouterUI } from '@teambit/react-router';
import { ReactRouterAspect } from '@teambit/react-router';
// WIP!
import { getDataFromTree } from '@apollo/react-ssr';

import React, { ReactNode, ComponentType } from 'react';
import ReactDOM from 'react-dom';
// WIP!
import ReactDOMServer from 'react-dom/server';

import { Compose } from './compose';
import { UIRootFactory } from './ui-root.ui';
import { UIAspect, UIRuntime } from './ui.aspect';
import { ClientContext } from './ui/client-context';
import { Html, MountPoint, Assets } from './ssr/html';
import type { SsrContent } from './ssr/ssr-content';
import type { BrowserData } from './ssr/request-browser';

type HudSlot = SlotRegistry<ReactNode>;
type ContextSlot = SlotRegistry<ContextType>;
export type UIRootRegistry = SlotRegistry<UIRootFactory>;

type ContextType = ComponentType<{}>;

type RenderingContext = Record<string, any>;
type Serializable = any;
type SsrLifecycle = {
  init?: (browser: BrowserData | undefined) => any | undefined;
  beforeRender?: (ctx: RenderingContext) => any | undefined;
  afterRender?: (ctx: RenderingContext) => { state: Serializable } | Promise<{ state: Serializable }> | undefined;
};
type SsrLifecycleSlot = SlotRegistry<SsrLifecycle>;

// import * as serviceWorker from './serviceWorker';

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
// serviceWorker.unregister();

/**
 * extension
 */
export class UiUI {
  constructor(
    /**
     * GraphQL extension.
     */
    private graphql: GraphqlUI,

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
    const GraphqlProvider = this.graphql.getProvider;
    const rootFactory = this.getRoot(rootExtension);
    if (!rootFactory) throw new Error(`root: ${rootExtension} was not found`);
    const uiRoot = rootFactory();
    const routes = this.router.renderRoutes(uiRoot.routes, { initialLocation: window.location.href });
    const hudItems = this.hudSlot.values();
    const contexts = this.contextSlot.values();

    ReactDOM.render(
      <GraphqlProvider>
        <ClientContext>
          <Compose components={contexts}>
            {hudItems}
            {routes}
          </Compose>
        </ClientContext>
      </GraphqlProvider>,
      document.getElementById('root')
    );
  }

  // WORK IN PROGRESS.
  async renderSsr(rootExtension: string, { assets, browser }: SsrContent = {}) {
    const GraphqlProvider = this.graphql.getSsrProvider();
    const rootFactory = this.getRoot(rootExtension);
    if (!rootFactory) throw new Error(`root: ${rootExtension} was not found`);

    const uiRoot = rootFactory();
    const routes = this.router.renderRoutes(uiRoot.routes, { initialLocation: browser?.location.url });
    const hudItems = this.hudSlot.values();
    const contexts = this.contextSlot.values();

    // maybe we should use internal url?
    const serverUrl = browser?.location.origin
      ? `${browser?.location.origin}/graphql`
      : 'http://localhost:3000/graphql';

    const client = this.graphql.createSsrClient({ serverUrl, cookie: browser?.cookie });

    let context = await this.initSsrContext(browser);

    const app = (
      <MountPoint>
        <GraphqlProvider client={client}>
          <ClientContext>
            <Compose components={contexts}>
              {hudItems}
              {routes}
            </Compose>
          </ClientContext>
        </GraphqlProvider>
      </MountPoint>
    );

    context = await this.beforeRenderHook(context);

    await getDataFromTree(app);

    const renderedApp = ReactDOMServer.renderToString(app);

    const realtimeAssets = await this.afterRenderHook(context);
    const state = {
      'gql-cache': JSON.stringify(client.extract()),
    };

    const html = <Html title="bit dev ssred!" assets={{ ...assets, ...realtimeAssets, state }} />;
    const renderedHtml = `<!DOCTYPE html>${ReactDOMServer.renderToStaticMarkup(html)}`;
    const fullHtml = Html.fillContent(renderedHtml, renderedApp);

    return fullHtml;
  }

  /** adds elements to the Heads Up Display */
  registerHudItem = (element: ReactNode) => {
    this.hudSlot.register(element);
  };

  // ** adds global context at the ui root */
  registerContext(context: ContextType) {
    this.contextSlot.register(context);
  }

  registerRoot(uiRoot: UIRootFactory) {
    return this.uiRootSlot.register(uiRoot);
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

  private async beforeRenderHook(ctx: RenderingContext) {
    const update: RenderingContext = {};

    const promises = this.ssrLifecycleSlot.toArray().map(async ([key, hooks]) => {
      if (!hooks.beforeRender) return;

      const result = await hooks.beforeRender(ctx[key]);
      if (result) update[key] = result;
    });

    await Promise.all(promises);

    return {
      ...ctx,
      ...update,
    };
  }

  private async afterRenderHook(ctx: RenderingContext) {
    const state = {};

    const promises = this.ssrLifecycleSlot.toArray().map(async ([key, hooks]) => {
      if (!hooks.afterRender) return;

      const result = await hooks.afterRender(ctx[key]);

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
    Slot.withType<ContextType>(),
    Slot.withType<SsrLifecycle>(),
  ];

  static dependencies = [GraphqlAspect, ReactRouterAspect];

  static runtime = UIRuntime;

  static async provider(
    [graphql, router]: [GraphqlUI, ReactRouterUI],
    config,
    [uiRootSlot, hudSlot, contextSlot, ssrLifecycleSlot]: [UIRootRegistry, HudSlot, ContextSlot, SsrLifecycleSlot]
  ) {
    return new UiUI(graphql, router, uiRootSlot, hudSlot, contextSlot, ssrLifecycleSlot);
  }
}

UIAspect.addRuntime(UiUI);
