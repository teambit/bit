import { ExecutionContext } from '@teambit/envs';
import { Component } from '@teambit/component';

export interface AppContext extends ExecutionContext {
  /**
   * determine whether to serve the application in dev mode.
   */
  dev: boolean;

  appName: string;

  appComponent: Component;
  
  workdir: string;

  /**
   * A path for the host root dir
   * Host root dir is the dir where we run the app from
   * This can be used in different bundle options which run require.resolve
   * for example when configuring webpack aliases or webpack expose loader on the peers deps
   */
  hostRootDir?: string;
}
