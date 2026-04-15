import React, { type ReactNode } from 'react';
import { Html, mountPointId, ssrCleanup } from '@teambit/ui-foundation.ui.rendering.html';
import { Composer, type Wrapper } from '@teambit/base-ui.utils.composer';
import ReactDOM from 'react-dom';
import compact from 'lodash.compact';
import type { ClientRenderPlugin } from './render-plugins';

type ReactRoot = { render: (children: ReactNode) => void };

/**
 * creates a React root using createRoot (React 18+) when available,
 * falling back to ReactDOM.render (React 17) otherwise.
 */
function createReactRoot(container: HTMLElement): ReactRoot {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createRoot } = require('react-dom/client');
    return createRoot(container);
  } catch {
    return {
      render: (children: ReactNode) => {
        // @ts-ignore
        ReactDOM.render(children as React.ReactElement, container);
      },
    };
  }
}

export type BrowserRendererOptions = {
  /** load and remove dehydrated state from the dom  */
  popAssets: () => Map<string, string>;
  /** mount point element or id */
  mountPointElement: string | HTMLElement;
  /** runs after rehydration */
  cleanup: () => void;
};
const defaultOptions: BrowserRendererOptions = {
  popAssets: Html.popAssets,
  mountPointElement: mountPointId,
  cleanup: ssrCleanup,
};

export class BrowserRenderer {
  options: BrowserRendererOptions;
  private root: ReactRoot | undefined;
  constructor(
    /** effect rendering at key triggers. keep order consistent between server and browser */
    private plugins: ClientRenderPlugin<any, any>[],
    options?: Partial<BrowserRendererOptions>
  ) {
    this.options = { ...options, ...defaultOptions };
  }

  /** render and rehydrate client-side */
  async render(children: ReactNode) {
    // (*) load state from the dom
    const deserializedState = await this.deserialize();

    // (1) init setup client plugins
    let renderContexts = await this.triggerBrowserInit(deserializedState);

    // (2) make react dom
    const reactContexts = this.getReactContexts(renderContexts);
    const app = <Composer components={reactContexts}>{children}</Composer>;

    renderContexts = await this.triggerBeforeHydrateHook(renderContexts, app);

    // (3) render / rehydrate
    const mountPoint =
      typeof this.options.mountPointElement === 'string'
        ? document.getElementById(this.options.mountPointElement)
        : this.options.mountPointElement;
    if (!this.root && mountPoint) {
      this.root = createReactRoot(mountPoint);
    }
    this.root?.render(app);

    await this.triggerHydrateHook(renderContexts, mountPoint);

    // (3.1) remove ssr only styles
    this.options.cleanup();
  }

  private async deserialize() {
    const { plugins } = this;
    const rawAssets = this.options.popAssets();

    const deserialized = await Promise.all(
      plugins.map(async (plugin) => {
        if (!('deserialize' in plugin)) return undefined;
        if (!plugin.key) throw new Error('Key is required for .deserialize()');

        try {
          const raw = rawAssets.get(plugin.key);
          return plugin.deserialize?.(raw);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`failed deserializing server state for aspect "${plugin.key}"`, e);
          return undefined;
        }
      })
    );

    return deserialized;
  }

  private triggerBrowserInit(deserializedState: any[]) {
    const { plugins } = this;

    const initPromises = plugins.map((plugin, idx) => {
      const state = deserializedState[idx];
      return plugin.browserInit?.(state);
    });
    return Promise.all(initPromises);
  }

  private triggerBeforeHydrateHook(renderContexts: any[], app: JSX.Element) {
    const { plugins } = this;

    const promises = plugins.map(async (plugin, idx) => {
      const ctx = renderContexts[idx];
      const nextCtx = await plugin.onBeforeHydrate?.(ctx, app);
      return nextCtx || ctx;
    });

    return Promise.all(promises);
  }

  private async triggerHydrateHook(renderContexts: any[], mountPoint: HTMLElement | null) {
    const { plugins } = this;

    const promises = plugins.map((plugin, idx) => {
      const renderCtx = renderContexts[idx];
      return plugin.onHydrate?.(renderCtx, mountPoint);
    });

    await Promise.all(promises);
  }

  private getReactContexts(renderContexts: any[]): Wrapper[] {
    const { plugins } = this;

    return compact(
      plugins.map((plugin, idx) => {
        const renderCtx = renderContexts[idx];
        const props = { renderCtx };
        const decorator = plugin.reactClientContext || plugin.reactContext;
        if (!decorator) return undefined;
        return [decorator, props];
      })
    );
  }
}
