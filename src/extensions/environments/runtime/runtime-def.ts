import { Environment } from '../environment';
import { Component } from '../../component';
import { Workspace } from '../../workspace';

export class RuntimeDef {
  constructor(
    /**
     * ID of the wrapping extension.
     */
    readonly id: string,

    /**
     * environment
     */
    readonly env: Environment,

    /**
     * components to be loaded in the environment
     */
    readonly components: Component[]
  ) {}

  dev(workspace: Workspace) {
    return this.env.dev(workspace, this.components);
  }
}
