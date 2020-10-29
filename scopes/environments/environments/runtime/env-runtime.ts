import { Component } from '@teambit/component';

import { Environment } from '../environment';

/**
 * env runtime is an instance which represent the given env in a
 */
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
