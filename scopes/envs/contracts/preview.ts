import type { AsyncEnvHandler, EnvHandler } from './env-handler';
import type { Bundler, BundlerContext, DevServer, DevServerContext } from './bundler';

/**
 * the preview of an env.
 * the methods use the method syntax, so services typed with the bundler aspect's contexts fit too.
 */
export type Preview = {
  /**
   * return a path to the mounter.
   */
  getMounter(): string;

  /**
   * return a path to a docs template.
   */
  getDocsTemplate(): string;

  /**
   * return a dev server instance to use for previews.
   */
  getDevServer(context: DevServerContext): EnvHandler<DevServer> | AsyncEnvHandler<DevServer>;

  /**
   * return an instance of a preview bundler.
   */
  getBundler(context: BundlerContext): EnvHandler<Bundler> | AsyncEnvHandler<Bundler>;

  /**
   * return the id of the dev server. used to dedupe dev servers.
   */
  getDevEnvId(): string;

  /**
   * dependencies that are bundled with the env template and are externals for the component bundle.
   */
  getHostDependencies(): string[];

  /**
   * return the preview config, e.g. the strategy name to use when bundling the components.
   */
  getPreviewConfig(): EnvPreviewConfig;
};

export type PreviewStrategyName = 'env' | 'component';

export type EnvPreviewConfig = {
  strategyName?: PreviewStrategyName;
  splitComponentBundle?: boolean;

  /**
   * whether the env's preview pipeline can consume component source files directly.
   */
  supportsUseSource?: boolean;
};

export const COMPONENT_PREVIEW_STRATEGY_NAME = 'component';

/**
 * the context of the component preview in the browser. returns the context an aspect registered.
 */
export interface RenderingContext {
  get(aspectId: string): { [key: string]: any } | undefined;
}

/**
 * the props a docs template receives. `TProvider` is the UI framework's component type, e.g.
 * `React.ComponentType`. the contract doesn't depend on a UI framework, so it defaults to `any`.
 */
export type DocsRootProps<TProvider = any> = {
  Provider: TProvider | undefined;
  componentId: string;
  docs: { [key: string]: any } | undefined;
  compositions?: any;
  context: RenderingContext;
};
