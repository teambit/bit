import { ExecutionContext } from '@teambit/envs';

export interface AppContext extends ExecutionContext {
  /**
   * determine whether to serve the application in dev mode.
   */
  dev: boolean;
}
