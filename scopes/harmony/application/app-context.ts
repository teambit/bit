import { ExecutionContext } from '@teambit/envs';
import type { Harmony } from '@teambit/harmony';
import type { Component } from '@teambit/component';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';

export class AppContext extends ExecutionContext {
  constructor(
    /**
     * name of the app
     */
    readonly appName: string,

    /**
     * instance of harmony.
     */
    readonly harmony: Harmony,

    /**
     * determine whether to serve the application in dev mode.
     */
    readonly dev: boolean,

    /**
     * application component instance.
     */
    readonly appComponent: Component,

    /**
     * working directory of the component.
     */
    readonly workdir: string,

    /**
     * execution context of the app.
     */
    readonly execContext: ExecutionContext,

    /**
     * A path for the host root dir
     * Host root dir is the dir where we run the app from
     * This can be used in different bundle options which run require.resolve
     * for example when configuring webpack aliases or webpack expose loader on the peers deps
     */
    readonly hostRootDir?: string,

    /**
     * A port to run the app on
     */
    readonly port?: number,

    /**
     * arguments to pass to the app.
     */
    readonly args?: string,

    /**
     * path to the application component in the workspace
     */
    readonly workspaceComponentPath?: string,

    /**
     * list of env variables to include.
     */
    readonly envVariables: Record<string, string> = {}
  ) {
    super(execContext.upper, execContext.envRuntime, execContext.components);
  }

  /**
   * return a logger instance for the env.
   */
  createLogger(name?: string): Logger {
    const loggerMain = this.harmony.get<LoggerMain>(LoggerAspect.id);
    const appComponentId = this.appComponent.id;
    const loggerName = name ? `${appComponentId.toString()}::${name}` : appComponentId.toString();

    return loggerMain.createLogger(loggerName);
  }

  /**
   * get an instance of an aspect.
   * make sure it is loaded prior to requesting it.
   */
  getAspect<T>(aspectId: string): T | undefined {
    return this.harmony.get<T>(aspectId);
  }

  static compose(appContext: AppContext, overrides?: Partial<AppContext>) {
    return new AppContext(
      overrides?.appName || appContext?.appName,
      overrides?.harmony || appContext?.harmony,
      overrides?.dev || appContext?.dev,
      overrides?.appComponent || appContext?.appComponent,
      overrides?.workdir || appContext?.workdir,
      overrides?.execContext || appContext?.execContext,
      overrides?.hostRootDir || appContext?.hostRootDir,
      overrides?.port || appContext?.port,
      overrides?.args || appContext?.args,
      overrides?.workspaceComponentPath || appContext?.workspaceComponentPath,
      overrides?.envVariables || appContext?.envVariables
    );
  }
}
