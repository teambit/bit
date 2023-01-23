import { Bundler, BundlerContext, DevServer, DevServerContext } from '@teambit/bundler';
import { AsyncEnvHandler, EnvHandler } from '@teambit/envs';

/**
 * interface for implementing component previews
 * using bit's development environments.
 */
export interface PreviewEnv {
  preview(): EnvHandler<Preview>;
}

export type Preview = {
  /**
   * return an instance of a mounter.
   */
  getMounter: () => string;

  /**
   * return a path to a docs template.
   */
  getDocsTemplate: () => string;

  /**
   * return a dev server instance to use for previews.
   */
  getDevServer: (context: DevServerContext) => EnvHandler<DevServer> | AsyncEnvHandler<DevServer>;

  /**
   * return an instance for a preview bundler.
   */
  getBundler: (context: BundlerContext) => EnvHandler<Bundler> | AsyncEnvHandler<Bundler>;

  /**
   * return the id of the dev server.
   * used for deduplication of dev servers
   */
  getDevEnvId: () => string;

  /**
   * dependencies that will bundled as part of the env template and will configured as externals for the component bundle
   * these dependencies will be available in the preview on the window.
   * these dependencies will have only one instance on the page.
   * for dev server these dependencies will be aliased
   */
  getHostDependencies: () => string[];
};
