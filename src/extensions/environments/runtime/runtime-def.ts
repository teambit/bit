import { Environment } from '../environment';
import { Component } from '../../component';

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

  dev() {
    return this.env.dev(this.components);
  }
}
