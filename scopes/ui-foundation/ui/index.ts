import { UIAspect, UIRuntime } from './ui.aspect';

export { UIAspect, UIRuntime, UIAspect as default };

export * from './events';
export { UIRoot, PostStartOptions, ProxyEntry } from './ui-root';
export type { UiMain, PreStartOpts } from './ui.main.runtime';
export type { UiUI } from './ui.ui.runtime';
export type { StartPlugin, StartPluginOptions } from './start-plugin';
export type {
  BrowserData,
  RenderPlugins,
  /** @deprecated - legacy name, use RenderPlugins */
  RenderPlugins as RenderLifecycle,
} from './react-ssr';
export type { UIRootUI, UIRootFactory } from './ui-root.ui';
export type { UIServer } from './ui-server';

// using `useDataQuery` from this package is deprecated, use `@teambit/ui-foundation.ui.hooks.use-data-query` directly
export { DataQueryResult, useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
// temporary. TODO: fix this
export { useMutation } from '@apollo/client';
