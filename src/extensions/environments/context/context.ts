import { Component } from '../../component';
import { Workspace } from '../../workspace';
import { Runtime } from '../runtime';

export type ServiceMap<T> = {
  [env: string]: T;
};

export class EnvContext {
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
    private envInstance: any,

    /**
     * components for the environment context
     */
    readonly components: Component[],

    /**
     * component workspace.
     */
    readonly workspace: Workspace
  ) {}

  applyAll<T>(name: string, args: any[]): ServiceMap<T> {}

  apply<T>(name: string, args: any[]): T {
    if (!this.envInstance[name]) {
      throw new Error('method not implmented');
    }

    return this.envInstance[name].apply(this.envInstance, ...args);
  }
}
