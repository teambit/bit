import type * as SSR from '@teambit/react.rendering.ssr';

export { UIAspect, UIAspect as default, UIRuntime } from './ui.aspect';

export * from './events';
export { UIRoot, PostStartOptions, ProxyEntry } from './ui-root';
export type { UiMain, PreStartOpts } from './ui.main.runtime';
export type { UiUI } from './ui.ui.runtime';
export type { StartPlugin, StartPluginOptions } from './start-plugin';
export type { SSR };

export type { UIRootUI, UIRootFactory } from './ui-root.ui';
export type { UIServer } from './ui-server';

// using `useDataQuery` from this package is deprecated, use `@teambit/ui-foundation.ui.hooks.use-data-query` directly
export { DataQueryResult, useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
// temporary. TODO: fix this
export { useMutation } from '@apollo/client';

// some types still used by Symphony
export {
  /** @deprecated - use SSR.BrowserData */
  BrowserData,
  /** @deprecated - use SSR.RenderPlugin */
  RenderPlugin,
  /** @deprecated use SSR.RenderPlugin */
  RenderPlugin as RenderPlugins,
  /** @deprecated use SSR..RenderPlugin */
  RenderPlugin as RenderLifecycle,
} from '@teambit/react.rendering.ssr';
