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
}
