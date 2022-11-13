import { Bundler, BundlerContext, DevServer, DevServerContext } from "@teambit/bundler";
import { EnvHandler } from "@teambit/envs";

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
  getMounter: () => string

  /**
   * return a path to a docs template.
   */
   getDocsTemplate: () => string;

  /**
   * return a dev server instance to use for previews.
   */
  getDevServer: (context: DevServerContext) => EnvHandler<DevServer>;

  /**
   * return an instance for a preview bundler.
   */
  getBundler: (context: BundlerContext) => EnvHandler<Bundler>;
}
