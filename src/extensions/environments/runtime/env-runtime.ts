import { Environment } from '../environment';
import { Component } from '../../component';
import { Workspace } from '../../workspace';
import { EnvService } from '../services';
import { EnvContext } from '../context';

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

  run(workspace: Workspace, service: EnvService) {
    return service.run(new EnvContext(this.id, this.env, this.components, workspace));
  }
}
