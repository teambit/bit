import React, { ReactNode } from 'react';
import { merge } from 'webpack-merge';
import compact from 'lodash.compact';
import ReactDOM from 'react-dom';
import ReactDOMServer from 'react-dom/server';

import { Html, MountPoint, mountPointId, ssrCleanup, Assets } from '@teambit/ui-foundation.ui.rendering.html';
import { Composer, Wrapper } from '@teambit/base-ui.utils.composer';

import type { RenderPlugins } from './render-lifecycle';
import type { SsrContent } from './ssr-content';
import type { RequestServer } from './request-server';
import type { BrowserData } from './request-browser';

type RenderPluginsWithId = [key: string, hooks: RenderPlugins];

export class ReactSSR {
  constructor(
    // create array once to keep consistent indexes
    private lifecycleHooks: RenderPluginsWithId[]
  ) {}

  /** render and rehydrate client-side */
  async renderBrowser(children: ReactNode) {
    // (*) load state from the dom
    const deserializedState = await this.deserialize();

    // (1) init setup client plugins
    let renderContexts = await this.triggerBrowserInit(deserializedState);

    // (2) make react dom
    const reactContexts = this.getReactContexts(renderContexts);
    const app = <Composer components={reactContexts}>{children}</Composer>;

    renderContexts = await this.triggerBeforeHydrateHook(renderContexts, app);

    // (3) render / rehydrate
    const mountPoint = document.getElementById(mountPointId);
    // .render() already runs `.hydrate()` behind the scenes.
    // in the future, we may want to replace it with .hydrate()
    ReactDOM.render(app, mountPoint);

    await this.triggerHydrateHook(renderContexts, mountPoint);

    // (3.1) remove ssr only styles
    ssrCleanup();
  }

  /** render dehydrated server-side */
  async renderServer(children: ReactNode, { assets, browser, server }: SsrContent = {}): Promise<string> {
    // (1) init
    let renderContexts = await this.triggerServerInit(browser, server);

    // (2) make React dom
    const reactContexts = this.getReactContexts(renderContexts);
    const app = (
      <MountPoint>
        <Composer components={reactContexts}>{children}</Composer>
      </MountPoint>
    );

    renderContexts = await this.triggerBeforeRender(renderContexts, app);

    // (3) render (to string)
    const renderedApp = ReactDOMServer.renderToString(app);

    // (*) serialize state
    const realtimeAssets = await this.serialize(renderContexts, app);
    // @ts-ignore // TODO upgrade 'webpack-merge'
    const totalAssets = merge(assets, realtimeAssets) as Assets;

    // (4) render html-template (to string)
    const html = <Html assets={totalAssets} withDevTools fullHeight ssr />;
    const renderedHtml = `<!DOCTYPE html>${ReactDOMServer.renderToStaticMarkup(html)}`;
    const fullHtml = Html.fillContent(renderedHtml, renderedApp);

    // (5) serve
    return fullHtml;
  }

  private triggerBrowserInit(deserializedState: any[]) {
    const { lifecycleHooks } = this;

    const initPromises = lifecycleHooks.map(([, hooks], idx) => {
      const state = deserializedState[idx];
      return hooks.browserInit?.(state);
    });
    return Promise.all(initPromises);
  }

  private triggerServerInit(browser?: BrowserData, server?: RequestServer) {
    const { lifecycleHooks } = this;
    const promises = lifecycleHooks.map(([, hooks]) => hooks.serverInit?.({ browser, server }));
    return Promise.all(promises);
  }

  private triggerBeforeHydrateHook(renderContexts: any[], app: JSX.Element) {
    const { lifecycleHooks } = this;

    const promises = lifecycleHooks.map(async ([, hooks], idx) => {
      const ctx = renderContexts[idx];
      const nextCtx = await hooks.onBeforeHydrate?.(ctx, app);
      return nextCtx || ctx;
    });

    return Promise.all(promises);
  }

  private async triggerHydrateHook(renderContexts: any[], mountPoint: HTMLElement | null) {
    const { lifecycleHooks } = this;

    const promises = lifecycleHooks.map(([, hooks], idx) => {
      const renderCtx = renderContexts[idx];
      return hooks.onHydrate?.(renderCtx, mountPoint);
    });

    await Promise.all(promises);
  }

  private async triggerBeforeRender(renderContexts: any[], app: JSX.Element) {
    const { lifecycleHooks } = this;

    const promises = lifecycleHooks.map(async ([, hooks], idx) => {
      const ctx = renderContexts[idx];
      const nextCtx = await hooks.onBeforeRender?.(ctx, app);
      return nextCtx || ctx;
    });

    await Promise.all(promises);

    return renderContexts;
  }

  private getReactContexts(renderContexts: any[]): Wrapper[] {
    const { lifecycleHooks } = this;

    return compact(
      lifecycleHooks.map(([, hooks], idx) => {
        const renderCtx = renderContexts[idx];
        const props = { renderCtx };
        return hooks.reactContext ? [hooks.reactContext, props] : undefined;
      })
    );
  }

  private async deserialize() {
    const { lifecycleHooks } = this;
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

  private async serialize(renderContexts: any[], app: ReactNode): Promise<Assets> {
    const { lifecycleHooks } = this;
    const json = {};

    const promises = lifecycleHooks.map(async ([key, hooks], idx) => {
      const renderCtx = renderContexts[idx];
      const result = await hooks.serialize?.(renderCtx, app);

      if (!result) return;
      if (result.json) json[key] = result.json;
    });

    await Promise.all(promises);

    // more assets will be available in the future
    return { json };
  }
}
