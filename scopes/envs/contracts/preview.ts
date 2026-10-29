import type { AsyncEnvHandler, EnvHandler } from './env-handler';

/**
 * the preview of an env. the bundler and dev-server contexts are defined by the preview and
 * bundler aspects, and are not part of this contract.
 */
export type Preview = {
  /**
   * return a path to the mounter.
   */
  getMounter: () => string;

  /**
   * return a path to a docs template.
   */
  getDocsTemplate: () => string;

  /**
   * return a dev server instance to use for previews.
   */
  getDevServer: (context: any) => EnvHandler<any> | AsyncEnvHandler<any>;

  /**
   * return an instance of a preview bundler.
   */
  getBundler: (context: any) => EnvHandler<any> | AsyncEnvHandler<any>;

  /**
   * return the id of the dev server. used to dedupe dev servers.
   */
  getDevEnvId: () => string;

  /**
   * dependencies that are bundled with the env template and are externals for the component bundle.
   */
  getHostDependencies: () => string[];

  /**
   * return the preview config, e.g. the strategy name to use when bundling the components.
   */
  getPreviewConfig: () => EnvPreviewConfig;
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
