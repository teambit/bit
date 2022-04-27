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
}
