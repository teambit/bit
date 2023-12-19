import type * as SSR from '@teambit/react.rendering.ssr';

export { UIAspect, UIRuntime, UIAspect as default } from './ui.aspect';

export * from './events';
export type { UIRoot, PostStartOptions, ProxyEntry } from './ui-root';
export type { UiMain, PreStartOpts } from './ui.main.runtime';
export type { UiUI } from './ui.ui.runtime';
export type { StartPlugin, StartPluginOptions } from './start-plugin';
export type { SSR };

export type { UIRootUI, UIRootFactory } from './ui-root.ui';
export type { UIServer } from './ui-server';
export { BUNDLE_UI_DIR, BundleUiTask } from './bundle-ui.task';
// using `useDataQuery` from this package is deprecated, use `@teambit/ui-foundation.ui.hooks.use-data-query` directly
export type { DataQueryResult } from '@teambit/ui-foundation.ui.hooks.use-data-query';
export { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
export { createImports, getIdSetters, getIdentifiers } from './create-root';
// temporary. TODO: fix this
export { useMutation } from '@apollo/client';

// some types still used by Symphony
export type {
  /** @deprecated - use SSR.BrowserData */
  BrowserData,
  /** @deprecated - use SSR.RenderPlugin */
  RenderPlugin,
  /** @deprecated use SSR.RenderPlugin */
  RenderPlugin as RenderPlugins,
  /** @deprecated use SSR..RenderPlugin */
  RenderPlugin as RenderLifecycle,
} from '@teambit/react.rendering.ssr';
