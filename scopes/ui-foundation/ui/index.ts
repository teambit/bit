import { UIAspect, UIRuntime } from './ui.aspect';

export * from './events';
export { UIRoot, PostStartOptions, ProxyEntry } from './ui-root';
export type { UiMain } from './ui.main.runtime';
export type { UiUI, ContextProps } from './ui.ui.runtime';
export type { RenderLifecycle } from './render-lifecycle';
export { UIRootUI, UIRootFactory } from './ui-root.ui';
export { UIAspect, UIRuntime };
export type { BrowserData } from './ssr/request-browser';
export default UIAspect;

// using `useDataQuery` from this package is deprecated, use `@teambit/ui.hooks.use-data-query` directly
export { DataQueryResult, useDataQuery } from '@teambit/ui.hooks.use-data-query';
