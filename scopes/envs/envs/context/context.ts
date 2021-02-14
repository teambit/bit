import { EnvDefinition } from '../env-definition';

import { EnvRuntime, Runtime } from '../runtime';

export type ServiceMap<T> = {
  [env: string]: T;
};

export class ExecutionContext {
  constructor(
    /**
     * upper scope of all environment contexts.
     */
    readonly upper: Runtime,

    /**
     * runtime instance of the environment.
     */
    readonly envRuntime: EnvRuntime,

    /**
     * components applied in the execution context.
     */
    public components = envRuntime.components
  ) {}

  relatedContexts: string[] = [];

  /**
   * extension ID of the environment
   */
  get id() {
    return this.envRuntime.id;
  }

  /**
   * environment instance.
   */
  get env(): any {
    return this.envRuntime.env;
  }

  get envDefinition(): EnvDefinition {
    return new EnvDefinition(this.id, this.env);
  }

  apply<T>(name: string, args: any[]): T {
    if (!this.env[name]) {
      throw new Error(`method ${name} not implemented`);
    }

    return this.env[name].apply(this.env, ...args);
  }
}
