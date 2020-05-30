import { Environment } from '../environment';
import { Component } from '../../component';

export class EnvRuntime {
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
}
