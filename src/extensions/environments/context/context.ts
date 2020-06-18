import { Component } from '../../component';
import { Runtime } from '../runtime';

export type ServiceMap<T> = {
  [env: string]: T;
};

export class ExecutionContext {
  constructor(
    /**
     * extension ID of the environment
     */
    readonly id: string,

    /**
     * upper scope of all environment contexts.
     */
    readonly envRuntime: Runtime,

    /**
     * instance of the env
     */
    readonly env: any,

    /**
     * components for the environment context
     */
    readonly components: Component[]
  ) {}

  // applyAll<T>(name: string, args: any[]): ServiceMap<T> {}

  apply<T>(name: string, args: any[]): T {
    if (!this.env[name]) {
      throw new Error(`method ${name} not implemented`);
    }

    return this.env[name].apply(this.env, ...args);
  }
}
