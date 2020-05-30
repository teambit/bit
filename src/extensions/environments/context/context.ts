import { Component } from '../../component';
import { Workspace } from '../../workspace';

export class EnvContext {
  constructor(
    /**
     * extension ID of the environment
     */
    readonly id: string,

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

  apply<T>(name: string, args: any[]): T {
    if (!this.envInstance[name]) {
      throw new Error('method not implmented');
    }

    return this.envInstance[name].apply(this.envInstance, ...args);
  }
}
