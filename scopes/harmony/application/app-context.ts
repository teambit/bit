import { ExecutionContext } from '@teambit/envs';
import { Component } from '@teambit/component';

export class AppContext extends ExecutionContext {
  constructor(
    readonly appName: string,

    /**
     * determine whether to serve the application in dev mode.
     */
    readonly dev: boolean,

    readonly appComponent: Component,

    readonly workdir: string,

    execContext: ExecutionContext,

    /**
     * A path for the host root dir
     * Host root dir is the dir where we run the app from
     * This can be used in different bundle options which run require.resolve
     * for example when configuring webpack aliases or webpack expose loader on the peers deps
     */
    readonly hostRootDir?: string,

  ) {
    super(execContext.upper, execContext.envRuntime, execContext.components);
  }
  // static fromExecContext() {
    // return new AppContext();
  // }
}
