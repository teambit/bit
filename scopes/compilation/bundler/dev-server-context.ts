import { ExecutionContext } from '@teambit/envs';

export interface DevServerContext extends ExecutionContext {
  /**
   * array of files to include.
   */
  entry: string[];

  /**
   * public path.
   */
  publicPath: string;

  /**
   * root path of the workspace.
   */
  rootPath: string;

  /**
   * title of the page.
   */
  title?: string;

  /**
   * favicon of the page.
   */
  favicon?: string;

  /**
   * A path for the host root dir
   * Host root dir is usually the env root dir
   * This can be used in different bundle options which run require.resolve
   * for example when configuring webpack aliases or webpack expose loader on the peers deps
   */
  hostRootDir?: string;

  /**
   * Array of host dependencies, they are used later in case you use one of the following:
   *
   */
  hostDependencies?: string[];

  /**
   * Make the hostDependencies externals. externals (from webpack docs):
   * The externals configuration option provides a way of excluding dependencies from the output bundles.
   * Instead, the created bundle relies on that dependency to be present in the consumer's (any end-user application) environment.
   */
  externalizeHostDependencies?: boolean;

  /**
   * Make aliases for the hostDependencies.
   * the path of each one will be resolved by [hostRootDir, process.cwd(), __dirname]
   * this will usually replace the instance of import one of the host dependencies by the instance of the env provided it
   */
  aliasHostDependencies?: boolean;

  /**
   * Expose the hostDependencies on the global (window) object.
   * the path of each one will be resolved by [hostRootDir, process.cwd(), __dirname]
   * from the webpack plugin docs:
   * The expose-loader loader allows to expose a module (in whole or in part) to global object (self, window and global).
   */
  exposeHostDependencies?: boolean;
}
