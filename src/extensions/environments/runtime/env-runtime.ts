import { RuntimeDef } from './runtime-def';
import { Workspace } from '../../workspace';

export class EnvRuntime {
  constructor(
    /**
     * instance of the containing workspace.
     */
    readonly workspace: Workspace,

    /**
     * runtime instances of the environments.
     */
    readonly runtimeEnvs: RuntimeDef[]
  ) {}

  /**
   * load the development environment.
   */
  dev() {
    this.runtimeEnvs.forEach(def => def.dev(this.workspace));
  }
}
